import Ajv from "ajv";
import { promises as fs } from "node:fs";
import path from "node:path";

import { SD_IMAGES_ROOT_ENV_KEY } from "@/lib/env-keys";
import { buildExtraRootRelativePrefix } from "@/lib/extra-image-roots";
import {
  STYLES,
  type IAnimationConfig,
  type ICharacterSummary,
  type IDuplicateGroup,
  type IImageItem,
  type ILibraryData,
  type IMetadataFilterOption,
  type IPoseFilterOption,
  type IPosePatternFilter,
  type IPoseSummary,
  type IVideoLink,
  type TMediaType,
} from "@/types/library";

import { findAnimationNodeByKey, normalizeAnimationsConfig } from "./animations";
import {
  CHARACTERS_CONFIG_FILE_NAME,
  LIBRARY_CONFIG_FILE_NAME,
  POSE_FILTERS_FILE_NAME,
  readLibraryIndexCache,
  syncFirstSeenCache,
  writeLibraryIndexCache,
} from "./cache";
import {
  readToAnimateEntries,
  readToExtendEntries,
  readMarkedImageMap,
  removeMarkedImageMapEntryIfUnchanged,
  TO_ANIMATE_FILE_NAME,
  TO_EXTEND_FILE_NAME,
  VIDEO_LINKS_FILE_NAME,
  withMarkedImageFileLock,
  writeMarkedImageMap,
  isVideoLink,
  type IToAnimateEntry,
  type IToExtendEntry,
} from "./marks";
import {
  getExtraImagesRootPathsFromEnv,
  getImagesRootPathFromEnv,
  getMediaTypeForFileName,
  getRelativePathRootPrefix,
  isPreviewSidecarFileName,
  isTemporaryRenameFileName,
  MEDIA_EXTENSIONS,
} from "./paths";
import { compareNatural, normalizeRelativePath } from "./shared";

export * from "./animations";
export * from "./cache";
export * from "./marks";
export * from "./paths";

const DEFAULT_STYLE: string = "3d";
const DUPLICATE_REVIEW_CONFIG_FILE_NAME = "duplicate-reviews.json";
const DEFAULT_POSE_PATTERN_FILTER_CONFIGS = [{ label: "With Somebody", pattern: "^With " }];
const MAIN_ROOT_KEY = "main";

interface ILibraryConfig {
  styles?: string[];
  defaultStyle?: string;
  styleLabels?: Record<string, string>;
  // Recursive shape (plain strings, or {key,name,prompt,subVersions} nodes) validated by
  // normalizeAnimationsConfig, not Ajv - see its comment.
  animations?: unknown[];
}

interface IStyleConfig {
  styles: string[];
  defaultStyle: string;
  styleLabels: Partial<Record<string, string>>;
  animations: IAnimationConfig[];
}

interface ICharacterAccumulator {
  name: string;
  imageCount: number;
  styles: Set<string>;
  poses: Set<string>;
  thumbnailsByStyle: Partial<Record<string, string>>;
  thumbnailModifiedAtByStyle: Partial<Record<string, number>>;
}

interface ICharacterMetadata {
  name: string;
  category: string;
  serie?: string;
  tags?: string[];
}

interface ICharacterMetadataSummary {
  category: string;
  serie: string | null;
  tags: string[];
}

interface ILibraryIndexState {
  imageItems: IImageItem[];
  characterMap: Map<string, ICharacterAccumulator>;
  poseCounter: Map<string, number>;
}

interface IPosePatternFilterConfig {
  label: string;
  pattern: string;
  flags?: string;
}

export interface IReviewedDuplicateGroup {
  style: string;
  characterName: string;
  poseBaseName: string;
  fileNames: string[];
  // "" for the main root, or "extra-roots/<index>" for an extra root (see
  // getRelativePathRootPrefix). Absent on records written before extra roots existed, which are
  // treated as belonging to the main root, since that was the only root back then.
  rootPrefix?: string;
}

const ajv = new Ajv({ allErrors: false, strict: false });

const libraryConfigValidator = ajv.compile<ILibraryConfig>({
  type: "object",
  properties: {
    styles: {
      type: "array",
      items: { type: "string" },
    },
    defaultStyle: { type: "string" },
    styleLabels: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    // Items aren't constrained here: animations is a recursive shape (plain strings, or
    // {key,name,prompt,subVersions} nodes) that normalizeAnimationsConfig validates/normalizes
    // instead, since Ajv's `strict: false` mode doesn't support recursive schemas cleanly.
    animations: {
      type: "array",
    },
  },
  additionalProperties: true,
});

const characterMetadataValidator = ajv.compile<ICharacterMetadata>({
  type: "object",
  properties: {
    name: { type: "string" },
    category: { type: "string" },
    serie: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["name", "category"],
  additionalProperties: true,
});

const posePatternFilterConfigValidator = ajv.compile<IPosePatternFilterConfig>({
  type: "object",
  properties: {
    label: { type: "string" },
    pattern: { type: "string" },
    flags: { type: "string" },
  },
  required: ["label", "pattern"],
  additionalProperties: true,
});

const reviewedDuplicateGroupValidator = ajv.compile<IReviewedDuplicateGroup>({
  type: "object",
  properties: {
    style: { type: "string" },
    characterName: { type: "string" },
    poseBaseName: { type: "string" },
    fileNames: {
      type: "array",
      items: { type: "string" },
    },
    rootPrefix: { type: "string" },
  },
  required: ["style", "characterName", "poseBaseName", "fileNames"],
  additionalProperties: true,
});

const isLibraryConfig = (value: unknown): value is ILibraryConfig => {
  return libraryConfigValidator(value);
};

const isCharacterMetadata = (value: unknown): value is ICharacterMetadata => {
  return characterMetadataValidator(value);
};

const isPosePatternFilterConfig = (value: unknown): value is IPosePatternFilterConfig => {
  return posePatternFilterConfigValidator(value);
};

const isReviewedDuplicateGroup = (value: unknown): value is IReviewedDuplicateGroup => {
  return reviewedDuplicateGroupValidator(value);
};
const normalizeStyleNames = (styles: string[] | undefined): string[] => {
  if (!styles) {
    return [];
  }

  const normalizedStyles = styles.map((style) => style.trim()).filter((style) => style !== "");

  return [...new Set(normalizedStyles)];
};

const resolveDefaultStyle = (styles: string[], rawDefaultStyle: unknown): string => {
  if (typeof rawDefaultStyle === "string") {
    const normalizedDefaultStyle = rawDefaultStyle.trim();
    if (normalizedDefaultStyle && styles.includes(normalizedDefaultStyle)) {
      return normalizedDefaultStyle;
    }
  }

  if (styles.includes(DEFAULT_STYLE)) {
    return DEFAULT_STYLE;
  }

  return styles[0] ?? DEFAULT_STYLE;
};

const normalizeStyleLabels = (
  styles: string[],
  styleLabels: Record<string, string> | undefined,
): Partial<Record<string, string>> => {
  if (!styleLabels) {
    return {};
  }

  const styleSet = new Set(styles);
  const normalizedLabels: Partial<Record<string, string>> = {};

  for (const [style, label] of Object.entries(styleLabels)) {
    if (!styleSet.has(style)) {
      continue;
    }

    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      continue;
    }

    normalizedLabels[style] = normalizedLabel;
  }

  return normalizedLabels;
};

const readStyleConfig = async (rootPath: string): Promise<IStyleConfig> => {
  const configPath = path.join(rootPath, LIBRARY_CONFIG_FILE_NAME);
  const fallbackStyles = [...STYLES];
  const fallbackStyleLabels: Partial<Record<string, string>> = {};
  const fallbackAnimations: IAnimationConfig[] = [];

  let fileContent = "";
  try {
    fileContent = await fs.readFile(configPath, "utf8");
  } catch (error) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        styles: fallbackStyles,
        defaultStyle: DEFAULT_STYLE,
        styleLabels: fallbackStyleLabels,
        animations: fallbackAnimations,
      };
    }

    return {
      styles: fallbackStyles,
      defaultStyle: DEFAULT_STYLE,
      styleLabels: fallbackStyleLabels,
      animations: fallbackAnimations,
    };
  }

  try {
    const parsedContent: unknown = JSON.parse(fileContent);

    if (!isLibraryConfig(parsedContent)) {
      return {
        styles: fallbackStyles,
        defaultStyle: DEFAULT_STYLE,
        styleLabels: fallbackStyleLabels,
        animations: fallbackAnimations,
      };
    }

    const styles = normalizeStyleNames(parsedContent.styles);
    if (styles.length === 0) {
      return {
        styles: fallbackStyles,
        defaultStyle: DEFAULT_STYLE,
        styleLabels: fallbackStyleLabels,
        animations: normalizeAnimationsConfig(parsedContent.animations),
      };
    }

    return {
      styles,
      defaultStyle: resolveDefaultStyle(styles, parsedContent.defaultStyle),
      styleLabels: normalizeStyleLabels(styles, parsedContent.styleLabels),
      animations: normalizeAnimationsConfig(parsedContent.animations),
    };
  } catch {
    // Fallback to legacy defaults when config.json is malformed.
    return {
      styles: fallbackStyles,
      defaultStyle: DEFAULT_STYLE,
      styleLabels: fallbackStyleLabels,
      animations: fallbackAnimations,
    };
  }
};

const ucFirst = (value: string): string => {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const sanitizePoseName = (rawPoseName: string): string => {
  return rawPoseName.replace(/[_-]+/g, " ").trim();
};

const normalizeCharacterNameKey = (characterName: string): string => {
  return characterName.trim().toLowerCase();
};

const normalizeMetadataFilterValue = (value: string): string => {
  return value.trim().toLowerCase();
};

const normalizeMetadataTags = (tags: string[] | undefined): string[] => {
  if (!tags) {
    return [];
  }

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))].sort(
    compareNatural,
  );
};

const toMetadataFilterIds = (
  character: Pick<ICharacterSummary, "category" | "serie" | "tags">,
  filterIdByValue: Map<string, string>,
): string[] => {
  const values = [character.category, character.serie, ...character.tags];
  return [
    ...new Set(
      values.flatMap((value) => {
        if (!value?.trim()) {
          return [];
        }

        const filterId = filterIdByValue.get(normalizeMetadataFilterValue(value));
        return filterId ? [filterId] : [];
      }),
    ),
  ];
};

const buildMetadataFilterOptions = (characters: ICharacterSummary[]): IMetadataFilterOption[] => {
  const filtersByValue = new Map<string, IMetadataFilterOption>();
  const addFilter = (type: IMetadataFilterOption["type"], value: string): void => {
    const normalizedValue = normalizeMetadataFilterValue(value);
    if (!normalizedValue || filtersByValue.has(normalizedValue)) {
      return;
    }

    filtersByValue.set(normalizedValue, {
      id: `${type}::${value}`,
      type,
      value,
      label: type === "tag" ? ucFirst(value) : value,
    });
  };

  for (const character of characters) {
    if (character.category) {
      addFilter("category", character.category);
    }
  }
  for (const character of characters) {
    if (character.serie) {
      addFilter("serie", character.serie);
    }
  }
  for (const character of characters) {
    for (const tag of character.tags) {
      addFilter("tag", tag);
    }
  }

  return [...filtersByValue.values()].sort((a, b) => compareNatural(a.label, b.label));
};

const buildCharacterMetadataFilterIdsByName = (
  characters: ICharacterSummary[],
  metadataFilterOptions: IMetadataFilterOption[],
): Record<string, string[]> => {
  const filterIdByValue = new Map(
    metadataFilterOptions.map((option) => [normalizeMetadataFilterValue(option.value), option.id]),
  );

  return Object.fromEntries(
    characters.map((character) => [
      character.name,
      toMetadataFilterIds(character, filterIdByValue),
    ]),
  );
};

const createPosePatternFilterId = (label: string, pattern: string, flags: string): string => {
  const rawKey = `${label}\u0000${pattern}\u0000${flags}`;
  return `pose-pattern::${Buffer.from(rawKey).toString("base64url")}`;
};

const normalizePosePatternFilters = (
  filterConfigs: IPosePatternFilterConfig[],
): IPosePatternFilter[] => {
  const uniqueFilters = new Map<string, IPosePatternFilter>();

  for (const filterConfig of filterConfigs) {
    const label = filterConfig.label.trim();
    const pattern = filterConfig.pattern;
    const flags = filterConfig.flags?.trim() ?? "";

    if (!label || pattern.trim() === "") {
      continue;
    }

    try {
      // Validate patterns at load time to avoid runtime regex failures in the UI.
      new RegExp(pattern, flags);
    } catch {
      continue;
    }

    const filterId = createPosePatternFilterId(label, pattern, flags);
    uniqueFilters.set(filterId, {
      id: filterId,
      label,
      pattern,
      flags: flags || undefined,
    });
  }

  return [...uniqueFilters.values()];
};

const readPosePatternFilters = async (rootPath: string): Promise<IPosePatternFilter[]> => {
  const filtersPath = path.join(rootPath, POSE_FILTERS_FILE_NAME);

  let fileContent = "";
  try {
    fileContent = await fs.readFile(filtersPath, "utf8");
  } catch (error) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS);
    }

    return normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS);
  }

  try {
    const parsedContent: unknown = JSON.parse(fileContent);
    const items = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
    const validConfigs = items.filter(isPosePatternFilterConfig);
    const posePatternFilters = normalizePosePatternFilters(validConfigs);

    if (posePatternFilters.length > 0) {
      return posePatternFilters;
    }
  } catch {
    // Fallback to defaults when the file is malformed.
  }

  return normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS);
};

const readCharactersMetadata = async (
  rootPath: string,
): Promise<Map<string, ICharacterMetadataSummary>> => {
  const metadataPath = path.join(rootPath, "characters", CHARACTERS_CONFIG_FILE_NAME);

  let fileContent = "";
  try {
    fileContent = await fs.readFile(metadataPath, "utf8");
  } catch (error) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Map();
    }

    throw error;
  }

  const parsedContent: unknown = JSON.parse(fileContent);
  const items = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
  const metadataByCharacter = new Map<string, ICharacterMetadataSummary>();

  for (const item of items) {
    if (!isCharacterMetadata(item)) {
      continue;
    }

    const normalizedName = normalizeCharacterNameKey(item.name);
    if (!normalizedName) {
      continue;
    }

    metadataByCharacter.set(normalizedName, {
      category: item.category,
      serie: item.serie ?? null,
      tags: normalizeMetadataTags(item.tags),
    });
  }

  return metadataByCharacter;
};

export const readReviewedDuplicateGroups = async (
  rootPath: string,
): Promise<IReviewedDuplicateGroup[]> => {
  const configPath = path.join(rootPath, DUPLICATE_REVIEW_CONFIG_FILE_NAME);

  let fileContent = "";
  try {
    fileContent = await fs.readFile(configPath, "utf8");
  } catch {
    return [];
  }

  try {
    const parsedContent: unknown = JSON.parse(fileContent);
    const items = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
    return items.filter(isReviewedDuplicateGroup);
  } catch {
    // Fallback to no reviewed groups when the file is malformed.
    return [];
  }
};

export const writeReviewedDuplicateGroups = async (
  rootPath: string,
  reviewedGroups: IReviewedDuplicateGroup[],
): Promise<void> => {
  const configPath = path.join(rootPath, DUPLICATE_REVIEW_CONFIG_FILE_NAME);
  await fs.writeFile(configPath, `${JSON.stringify(reviewedGroups, null, 2)}\n`, "utf8");
};

// One pending request to animate/extend, resolved against the image library so it carries the
// style/character/target-name needed to group it with candidate videos.
interface IPendingAnimationClaim {
  sourceRelativePath: string;
  sourceMediaType: TMediaType;
  action: string;
  metadata: string;
  prompt: string;
  markFile: "animate" | "extend";
}

// Groups to-animate.json/to-extends.json entries by `${style}::${characterName}::${targetName}`
// (targetName = the resolved animation node's display name, sanitized the same way parsePoseName
// sanitizes a video's on-disk filename - so an animation named e.g. "Dance_Party" still matches a
// generated "Dance_Party.mp4", whose parsed poseBaseName has the underscore normalized to a
// space). Deliberately root-agnostic (no getRelativePathRootPrefix component): a source image in
// the main root commonly needs to match a generated video that an external tool wrote into an
// extra root used purely as its output folder - the two roots aren't necessarily unrelated
// character libraries the way findDuplicateGroups' grouping (which does key by root) has to
// assume. Iterates to-animate.json first, then to-extends.json, so a group's claims list is
// naturally in the documented file-order tie-break. Entries whose source no longer exists, or
// whose action key no longer resolves in the (possibly since-edited) animations config, are
// skipped - left pending, same as any other orphaned mark.
const buildPendingAnimationClaims = (
  animateEntries: Record<string, IToAnimateEntry>,
  extendEntries: Record<string, IToExtendEntry>,
  itemsByRelativePath: Map<string, IImageItem>,
  animations: IAnimationConfig[],
): Map<string, IPendingAnimationClaim[]> => {
  const claimsByGroupKey = new Map<string, IPendingAnimationClaim[]>();

  const addClaims = (
    // IToExtendEntry is a type alias for IToAnimateEntry (same shape, different mark file), so
    // this parameter's type is just IToAnimateEntry - a union of the two would be redundant.
    entries: Record<string, IToAnimateEntry>,
    sourceMediaType: TMediaType,
    markFile: "animate" | "extend",
  ): void => {
    for (const [sourceRelativePath, entry] of Object.entries(entries)) {
      const sourceItem = itemsByRelativePath.get(sourceRelativePath);
      if (!sourceItem) {
        continue;
      }

      const node = findAnimationNodeByKey(animations, entry.action);
      if (!node) {
        continue;
      }

      const groupKey = `${sourceItem.style}::${sourceItem.characterName}::${sanitizePoseName(node.name)}`;
      const claim: IPendingAnimationClaim = {
        sourceRelativePath,
        sourceMediaType,
        action: entry.action,
        metadata: entry.metadata,
        prompt: entry.prompt,
        markFile,
      };

      const existingClaims = claimsByGroupKey.get(groupKey);
      if (existingClaims) {
        existingClaims.push(claim);
      } else {
        claimsByGroupKey.set(groupKey, [claim]);
      }
    }
  };

  addClaims(animateEntries, "image", "animate");
  addClaims(extendEntries, "video", "extend");

  return claimsByGroupKey;
};

// Groups not-yet-linked video items by the same `${style}::${characterName}::${poseBaseName}`
// key a matching claim would produce (a generated video's poseBaseName is its filename before
// the numeric variant suffix, e.g. "Dance" for both "Dance.mp4"/"Dance 2.mp4"). Videos in an
// extra root are valid candidates too, and deliberately grouped without regard to root (see
// buildPendingAnimationClaims) - a source image in the main root commonly needs to match a video
// an external tool wrote into an extra root used purely as its output folder. Also excluded: any
// video that is itself the source of a pending claim (an extend mark's source is a video) -
// otherwise a video marked for extend could self-link (or satisfy someone else's claim) as if it
// were a freshly generated output. Each group is sorted by poseVariant (the only available proxy
// for generation order), tie-broken by modifiedAt.
const buildUnclaimedVideoCandidates = (
  imageItems: IImageItem[],
  videoLinks: Record<string, IVideoLink>,
  claimSourceRelativePaths: Set<string>,
): Map<string, IImageItem[]> => {
  const candidatesByGroupKey = new Map<string, IImageItem[]>();

  for (const item of imageItems) {
    if (item.mediaType !== "video") {
      continue;
    }

    if (item.relativePath in videoLinks || claimSourceRelativePaths.has(item.relativePath)) {
      continue;
    }

    const groupKey = `${item.style}::${item.characterName}::${item.poseBaseName}`;
    const existingCandidates = candidatesByGroupKey.get(groupKey);
    if (existingCandidates) {
      existingCandidates.push(item);
    } else {
      candidatesByGroupKey.set(groupKey, [item]);
    }
  }

  for (const candidates of candidatesByGroupKey.values()) {
    candidates.sort((a, b) => {
      return a.poseVariant !== b.poseVariant
        ? a.poseVariant - b.poseVariant
        : a.modifiedAt - b.modifiedAt;
    });
  }

  return candidatesByGroupKey;
};

// Matches newly-indexed, unclaimed videos to pending to-animate.json/to-extends.json marks and
// persists the result as video-links.json entries, freeing the fulfilled marks. Called once per
// uncached readImageLibrary() rebuild, right after pose-pattern filters are applied and before
// the library is materialized - wrapped end-to-end in try/catch since a failure here must never
// fail the library read it's embedded in.
//
// The FIFO pairing within a group (see buildUnclaimedVideoCandidates) is a heuristic: when
// generation order and mark-insertion order diverge, it can mis-attribute a link. That's the one
// accepted risk in this design (see VIDEO_FEATURES_PLAN.md).
export const reconcilePendingAnimationMarks = async (
  rootPath: string,
  imageItems: IImageItem[],
  animations: IAnimationConfig[],
): Promise<void> => {
  try {
    const toAnimateFilePath = path.join(rootPath, TO_ANIMATE_FILE_NAME);
    const toExtendFilePath = path.join(rootPath, TO_EXTEND_FILE_NAME);
    const videoLinksFilePath = path.join(rootPath, VIDEO_LINKS_FILE_NAME);

    // Reading pending marks, reading which videos are still unclaimed, matching them, and
    // persisting the result all happen under one lock on video-links.json: otherwise two
    // concurrent reconciliation passes (two uncached readImageLibrary() calls racing each other)
    // could interleave in two ways - both read the same video as unclaimed before either writes
    // and each link it to a different claim, or a second pass builds its claims from a stale
    // mark snapshot taken before a first pass already fulfilled and removed that mark, then
    // re-matches the same (already-fulfilled) claim to a different video. Either way one of the
    // resulting associations is spurious or lost even though its mark is gone.
    await withMarkedImageFileLock(videoLinksFilePath, async () => {
      const [animateEntries, extendEntries] = await Promise.all([
        readToAnimateEntries(rootPath),
        readToExtendEntries(rootPath),
      ]);

      const itemsByRelativePath = new Map(imageItems.map((item) => [item.relativePath, item]));
      const claimsByGroupKey = buildPendingAnimationClaims(
        animateEntries,
        extendEntries,
        itemsByRelativePath,
        animations,
      );

      if (claimsByGroupKey.size === 0) {
        return;
      }

      // A video that is itself the source of one of these claims (an extend mark's source is a
      // video) must never also be treated as an unclaimed candidate output - see
      // buildUnclaimedVideoCandidates.
      const claimSourceRelativePaths = new Set<string>();
      for (const claims of claimsByGroupKey.values()) {
        for (const claim of claims) {
          claimSourceRelativePaths.add(claim.sourceRelativePath);
        }
      }

      const currentLinkEntries = await readMarkedImageMap(videoLinksFilePath, isVideoLink);
      const candidatesByGroupKey = buildUnclaimedVideoCandidates(
        imageItems,
        currentLinkEntries,
        claimSourceRelativePaths,
      );

      const newLinksByRelativePath: Record<string, IVideoLink> = {};
      const fulfilledAnimateClaims: { relativePath: string; entry: IToAnimateEntry }[] = [];
      const fulfilledExtendClaims: { relativePath: string; entry: IToExtendEntry }[] = [];
      const linkedAt = Date.now();

      for (const [groupKey, claims] of claimsByGroupKey.entries()) {
        const candidates = candidatesByGroupKey.get(groupKey);
        if (!candidates) {
          continue;
        }

        const pairCount = Math.min(claims.length, candidates.length);
        for (let index = 0; index < pairCount; index += 1) {
          const claim = claims[index];
          const candidate = candidates[index];

          newLinksByRelativePath[candidate.relativePath] = {
            sourceRelativePath: claim.sourceRelativePath,
            sourceMediaType: claim.sourceMediaType,
            action: claim.action,
            prompt: claim.prompt,
            metadata: claim.metadata,
            linkedAt,
          };

          // The entry reconciliation actually observed when it built this claim, used below to
          // compare-and-delete rather than blindly deleting by key.
          const fulfilledEntry = {
            metadata: claim.metadata,
            action: claim.action,
            prompt: claim.prompt,
          };
          if (claim.markFile === "animate") {
            fulfilledAnimateClaims.push({
              relativePath: claim.sourceRelativePath,
              entry: fulfilledEntry,
            });
          } else {
            fulfilledExtendClaims.push({
              relativePath: claim.sourceRelativePath,
              entry: fulfilledEntry,
            });
          }
        }
      }

      if (Object.keys(newLinksByRelativePath).length === 0) {
        return;
      }

      // Persist the links before removing the marks that produced them: if this write fails
      // (e.g. disk full), the marks stay pending for a future reconciliation pass to retry,
      // rather than being deleted with no matching link to show for it.
      Object.assign(currentLinkEntries, newLinksByRelativePath);
      await writeMarkedImageMap(videoLinksFilePath, currentLinkEntries);

      await Promise.all([
        ...fulfilledAnimateClaims.map(({ relativePath, entry }) =>
          removeMarkedImageMapEntryIfUnchanged(toAnimateFilePath, relativePath, entry),
        ),
        ...fulfilledExtendClaims.map(({ relativePath, entry }) =>
          removeMarkedImageMapEntryIfUnchanged(toExtendFilePath, relativePath, entry),
        ),
      ]);
    });
  } catch {
    // Best-effort: see the comment above.
  }
};

export const parsePoseName = (
  fileName: string,
): {
  poseName: string;
  poseBaseName: string;
  poseVariant: number;
} => {
  const extension = path.extname(fileName);
  const withoutExtension = fileName.slice(0, Math.max(0, fileName.length - extension.length));
  const cleanName = sanitizePoseName(withoutExtension);
  let variantStartIndex = cleanName.length;

  while (variantStartIndex > 0) {
    const charCode = cleanName.codePointAt(variantStartIndex - 1) ?? 0;
    if (charCode < 48 || charCode > 57) {
      break;
    }
    variantStartIndex -= 1;
  }

  const poseBaseName = cleanName.slice(0, variantStartIndex).trim();
  const variantRaw = cleanName.slice(variantStartIndex);

  return {
    poseName: cleanName,
    poseBaseName: poseBaseName || cleanName,
    poseVariant: variantRaw ? Number.parseInt(variantRaw, 10) : 1,
  };
};

const getImageFileName = (image: IImageItem): string => {
  return image.relativePath.split("/").pop() ?? image.relativePath;
};

export const findDuplicateGroups = (images: IImageItem[]): IDuplicateGroup[] => {
  const imagesByGroupKey = new Map<string, IImageItem[]>();

  for (const image of images) {
    // Images are grouped for duplicate detection only within the same images root: an image
    // living in an extra root and one living in the main root (or a different extra root) may
    // share the same style/character/pose, but they're not in the same directory on disk, and
    // the "keep the primary, renumber the rest" validation flow assumes a single directory.
    const groupKey = `${getRelativePathRootPrefix(image.relativePath)}::${image.style}::${image.characterName}::${image.poseBaseName}`;
    const existingGroupImages = imagesByGroupKey.get(groupKey);

    if (existingGroupImages) {
      existingGroupImages.push(image);
    } else {
      imagesByGroupKey.set(groupKey, [image]);
    }
  }

  const duplicateGroups: IDuplicateGroup[] = [];

  for (const [groupKey, groupImages] of imagesByGroupKey.entries()) {
    if (groupImages.length < 2) {
      continue;
    }

    // A group without its first image (e.g. "Base 2.png"/"Base 3.png" but no "Base.png")
    // isn't a duplicate group, just a set of gaps in numbering.
    const hasFirstImage = groupImages.some((image) => image.poseVariant === 1);
    if (!hasFirstImage) {
      continue;
    }

    const sortedImages = [...groupImages].sort((a, b) => {
      if (a.poseVariant !== b.poseVariant) {
        return a.poseVariant - b.poseVariant;
      }

      return compareNatural(a.relativePath, b.relativePath);
    });

    const [firstImage] = sortedImages;

    duplicateGroups.push({
      id: groupKey,
      style: firstImage.style,
      characterName: firstImage.characterName,
      poseBaseName: firstImage.poseBaseName,
      images: sortedImages,
    });
  }

  duplicateGroups.sort((a, b) => {
    if (a.characterName !== b.characterName) {
      return compareNatural(a.characterName, b.characterName);
    }

    if (a.style !== b.style) {
      return compareNatural(a.style, b.style);
    }

    return compareNatural(a.poseBaseName, b.poseBaseName);
  });

  return duplicateGroups;
};

export const isDuplicateGroupReviewed = (
  group: Pick<IDuplicateGroup, "style" | "characterName" | "poseBaseName" | "images">,
  reviewedGroups: IReviewedDuplicateGroup[],
): boolean => {
  const currentFileNames = group.images.map(getImageFileName).sort(compareNatural);
  // All images in a group share the same root (see findDuplicateGroups), so any one of them
  // tells us which root this group belongs to.
  const currentRootPrefix = group.images[0]
    ? getRelativePathRootPrefix(group.images[0].relativePath)
    : "";

  return reviewedGroups.some((reviewedGroup) => {
    if (
      (reviewedGroup.rootPrefix ?? "") !== currentRootPrefix ||
      reviewedGroup.style !== group.style ||
      reviewedGroup.characterName !== group.characterName ||
      reviewedGroup.poseBaseName !== group.poseBaseName
    ) {
      return false;
    }

    const reviewedFileNames = [...reviewedGroup.fileNames].sort(compareNatural);

    return (
      reviewedFileNames.length === currentFileNames.length &&
      reviewedFileNames.every((fileName, index) => fileName === currentFileNames[index])
    );
  });
};

const listMediaFiles = async (characterFolderPath: string): Promise<string[]> => {
  const entries = await fs.readdir(characterFolderPath, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => !isPreviewSidecarFileName(fileName))
    .filter((fileName) => !isTemporaryRenameFileName(fileName))
    .filter((fileName) => MEDIA_EXTENSIONS.has(path.extname(fileName).toLowerCase()));
};

const resolveStyleFolders = async (
  charactersRootPath: string,
  configuredStyles: string[],
): Promise<string[]> => {
  const styleEntries = await fs.readdir(charactersRootPath, {
    withFileTypes: true,
  });

  return configuredStyles.filter((style) => {
    return styleEntries.some((entry) => entry.isDirectory() && entry.name === style);
  });
};

const toCharacterSummary = (
  accumulator: ICharacterAccumulator,
  firstSeenAt: number,
): ICharacterSummary => {
  return {
    name: accumulator.name,
    imageCount: accumulator.imageCount,
    poseCount: accumulator.poses.size,
    styles: [...accumulator.styles].sort(compareNatural),
    thumbnailsByStyle: accumulator.thumbnailsByStyle,
    thumbnailModifiedAtByStyle: accumulator.thumbnailModifiedAtByStyle,
    category: null,
    serie: null,
    tags: [],
    firstSeenAt,
  };
};

const computeFirstSeenByCharacter = (
  imageItems: IImageItem[],
  defaultStyle: string,
): Map<string, number> => {
  const firstSeenByCharacter = new Map<string, number>();

  for (const imageItem of imageItems) {
    if (imageItem.style !== defaultStyle) {
      continue;
    }

    const currentFirstSeen = firstSeenByCharacter.get(imageItem.characterName);
    if (currentFirstSeen === undefined || imageItem.firstSeenAt < currentFirstSeen) {
      firstSeenByCharacter.set(imageItem.characterName, imageItem.firstSeenAt);
    }
  }

  return firstSeenByCharacter;
};

const toPoseSummaries = (poseCounter: Map<string, number>): IPoseSummary[] => {
  return [...poseCounter.entries()]
    .map(([name, imageCount]) => ({ name, imageCount }))
    .sort((a, b) => compareNatural(a.name, b.name));
};

const buildPoseFilterOptions = (
  poses: IPoseSummary[],
  posePatternFilters: IPosePatternFilter[],
): IPoseFilterOption[] => {
  const matchingPatternFilterIds = new Set<string>();
  const compiledPatternFilters = posePatternFilters
    .map((filter) => {
      try {
        return { ...filter, regex: new RegExp(filter.pattern, filter.flags) };
      } catch {
        return null;
      }
    })
    .filter((filter): filter is IPosePatternFilter & { regex: RegExp } => filter !== null);

  const poseOptions = poses.flatMap((pose) => {
    const matchingFilters = compiledPatternFilters.filter((filter) => {
      filter.regex.lastIndex = 0;
      return filter.regex.test(pose.name);
    });

    for (const filter of matchingFilters) {
      matchingPatternFilterIds.add(filter.id);
    }

    return matchingFilters.length === 0 ? [{ value: pose.name, label: pose.name }] : [];
  });
  const patternOptions = posePatternFilters
    .filter((filter) => matchingPatternFilterIds.has(filter.id))
    .map((filter) => ({
      value: filter.id,
      label: filter.label,
    }));

  return [...poseOptions, ...patternOptions];
};

const applyPosePatternFilterIds = (
  imageItems: IImageItem[],
  posePatternFilters: IPosePatternFilter[],
): void => {
  const compiledPatternFilters = posePatternFilters
    .map((filter) => {
      try {
        return {
          id: filter.id,
          regex: new RegExp(filter.pattern, filter.flags),
        };
      } catch {
        return null;
      }
    })
    .filter((filter): filter is { id: string; regex: RegExp } => filter !== null);

  for (const imageItem of imageItems) {
    imageItem.posePatternFilterIds = compiledPatternFilters
      .filter((filter) => {
        filter.regex.lastIndex = 0;
        return filter.regex.test(imageItem.poseBaseName);
      })
      .map((filter) => filter.id);
  }
};

const createEmptyLibraryData = (
  rootConfigured: boolean,
  rootPath: string | null,
  warning: string | null,
  styleConfig: IStyleConfig | null = null,
  cacheAvailable: boolean = false,
): ILibraryData => {
  return {
    rootConfigured,
    rootPath,
    defaultStyle: styleConfig?.defaultStyle ?? DEFAULT_STYLE,
    styles: styleConfig?.styles ?? [...STYLES],
    styleLabels: styleConfig?.styleLabels ?? {},
    animations: styleConfig?.animations ?? [],
    images: [],
    characters: [],
    poses: [],
    posePatternFilters: normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS),
    poseFilterOptions: [],
    metadataFilterOptions: [],
    characterMetadataFilterIdsByName: {},
    warning,
    cacheAvailable,
  };
};

const createLibraryIndexState = (): ILibraryIndexState => {
  return {
    imageItems: [],
    characterMap: new Map<string, ICharacterAccumulator>(),
    poseCounter: new Map<string, number>(),
  };
};

const buildImageItem = (
  style: string,
  characterName: string,
  mediaFile: string,
  modifiedAt: number,
  rootKey: string,
  relativePathPrefix: string,
): IImageItem => {
  const parsedPose = parsePoseName(mediaFile);
  const relativePath = normalizeRelativePath(
    path.join(relativePathPrefix, "characters", style, characterName, mediaFile),
  );

  return {
    id: `${rootKey}::${style}::${characterName}::${mediaFile}`,
    style,
    characterName,
    poseName: parsedPose.poseName,
    poseBaseName: parsedPose.poseBaseName,
    poseVariant: parsedPose.poseVariant,
    relativePath,
    isNew: false,
    firstSeenAt: 0,
    modifiedAt,
    posePatternFilterIds: [],
    mediaType: getMediaTypeForFileName(mediaFile),
  };
};

const updateCharacterAccumulator = (
  characterMap: Map<string, ICharacterAccumulator>,
  imageItem: IImageItem,
): void => {
  const existingCharacter = characterMap.get(imageItem.characterName);
  const isBasePose = imageItem.poseBaseName.toLowerCase() === "base";

  if (existingCharacter) {
    existingCharacter.imageCount += 1;
    existingCharacter.styles.add(imageItem.style);
    existingCharacter.poses.add(imageItem.poseBaseName);

    if (isBasePose && !existingCharacter.thumbnailsByStyle[imageItem.style]) {
      existingCharacter.thumbnailsByStyle[imageItem.style] = imageItem.relativePath;
      existingCharacter.thumbnailModifiedAtByStyle[imageItem.style] = imageItem.modifiedAt;
    }

    return;
  }

  const characterAccumulator: ICharacterAccumulator = {
    name: imageItem.characterName,
    imageCount: 1,
    styles: new Set([imageItem.style]),
    poses: new Set([imageItem.poseBaseName]),
    thumbnailsByStyle: isBasePose ? { [imageItem.style]: imageItem.relativePath } : {},
    thumbnailModifiedAtByStyle: isBasePose ? { [imageItem.style]: imageItem.modifiedAt } : {},
  };

  characterMap.set(imageItem.characterName, characterAccumulator);
};

const incrementPoseCounter = (poseCounter: Map<string, number>, poseBaseName: string): void => {
  const currentPoseCount = poseCounter.get(poseBaseName) ?? 0;
  poseCounter.set(poseBaseName, currentPoseCount + 1);
};

const mergeIndexState = (target: ILibraryIndexState, source: ILibraryIndexState): void => {
  for (const imageItem of source.imageItems) {
    target.imageItems.push(imageItem);
    updateCharacterAccumulator(target.characterMap, imageItem);
    incrementPoseCounter(target.poseCounter, imageItem.poseBaseName);
  }
};

interface IImageRootContext {
  rootKey: string;
  relativePathPrefix: string;
}

const MAIN_ROOT_CONTEXT: IImageRootContext = { rootKey: MAIN_ROOT_KEY, relativePathPrefix: "" };

const indexCharacterFolder = async (
  style: string,
  characterName: string,
  characterFolderPath: string,
  state: ILibraryIndexState,
  rootContext: IImageRootContext,
): Promise<void> => {
  const mediaFiles = await listMediaFiles(characterFolderPath);
  // A file can be deleted between listMediaFiles() and this stat (e.g. a concurrent delete
  // request while a cache rebuild is in flight) - skip it rather than failing the whole folder.
  const stats = await Promise.all(
    mediaFiles.map((mediaFile) =>
      fs.stat(path.join(characterFolderPath, mediaFile)).catch(() => null),
    ),
  );

  for (const [index, mediaFile] of mediaFiles.entries()) {
    const stat = stats[index];
    if (!stat) {
      continue;
    }

    const imageItem = buildImageItem(
      style,
      characterName,
      mediaFile,
      Math.trunc(stat.mtimeMs),
      rootContext.rootKey,
      rootContext.relativePathPrefix,
    );
    state.imageItems.push(imageItem);
    updateCharacterAccumulator(state.characterMap, imageItem);
    incrementPoseCounter(state.poseCounter, imageItem.poseBaseName);
  }
};

const indexStyleFolder = async (
  style: string,
  stylePath: string,
  state: ILibraryIndexState,
  rootContext: IImageRootContext,
): Promise<void> => {
  const characterEntries = await fs.readdir(stylePath, { withFileTypes: true });

  // Each call only mutates `state` with synchronous Map/array operations between awaits, so
  // running them concurrently can't interleave mid-mutation - and the resulting image/character
  // lists are fully re-sorted later (sortImageItems, then by name in toLibraryData), so the
  // insertion order this produces doesn't need to match directory iteration order.
  await Promise.all(
    characterEntries
      .filter((characterEntry) => characterEntry.isDirectory())
      .map((characterEntry) => {
        const characterName = characterEntry.name;
        const characterFolderPath = path.join(stylePath, characterName);
        return indexCharacterFolder(style, characterName, characterFolderPath, state, rootContext);
      }),
  );
};

// Extra roots only ever contribute images for styles resolved from the main root's config.json
// (styles/defaultStyle/styleLabels are never read from an extra root), and a missing or
// unreadable "characters" folder in one extra root is skipped rather than failing the whole
// library load.
const indexExtraImageRoots = async (
  extraRootPaths: string[],
  availableStyles: string[],
): Promise<ILibraryIndexState[]> => {
  return Promise.all(
    extraRootPaths.map(async (extraRootPath, extraRootIndex) => {
      const rootContext: IImageRootContext = {
        rootKey: `extra-${extraRootIndex}`,
        relativePathPrefix: buildExtraRootRelativePrefix(extraRootIndex),
      };
      const extraCharactersRootPath = path.join(extraRootPath, "characters");

      // Wraps the whole indexing of this one root (not just the initial style-folder listing),
      // so a folder disappearing mid-scan (e.g. a concurrent delete) skips this root instead of
      // rejecting the Promise.all below and failing the entire library load.
      try {
        const extraAvailableStyles = await resolveStyleFolders(
          extraCharactersRootPath,
          availableStyles,
        );

        const styleStates = await Promise.all(
          extraAvailableStyles.map(async (style) => {
            const stylePath = path.join(extraCharactersRootPath, style);
            const styleState = createLibraryIndexState();
            await indexStyleFolder(style, stylePath, styleState, rootContext);
            return styleState;
          }),
        );

        const combinedState = createLibraryIndexState();
        for (const styleState of styleStates) {
          mergeIndexState(combinedState, styleState);
        }
        return combinedState;
      } catch {
        return createLibraryIndexState();
      }
    }),
  );
};

const sortImageItems = (imageItems: IImageItem[]): void => {
  imageItems.sort((a, b) => {
    if (a.characterName !== b.characterName) {
      return compareNatural(a.characterName, b.characterName);
    }

    if (a.style !== b.style) {
      return compareNatural(a.style, b.style);
    }

    if (a.poseBaseName !== b.poseBaseName) {
      return compareNatural(a.poseBaseName, b.poseBaseName);
    }

    return a.poseVariant - b.poseVariant;
  });
};

const toLibraryData = (
  rootPath: string,
  styleConfig: IStyleConfig,
  state: ILibraryIndexState,
  metadataByCharacter: Map<string, ICharacterMetadataSummary>,
  posePatternFilters: IPosePatternFilter[],
  cacheAvailable: boolean,
): ILibraryData => {
  const firstSeenByCharacter = computeFirstSeenByCharacter(
    state.imageItems,
    styleConfig.defaultStyle,
  );

  const characters = [...state.characterMap.values()]
    .map((accumulator) => {
      const summary = toCharacterSummary(
        accumulator,
        firstSeenByCharacter.get(accumulator.name) ?? 0,
      );
      const metadata = metadataByCharacter.get(normalizeCharacterNameKey(summary.name));

      if (!metadata) {
        return summary;
      }

      // `summary` is freshly built above (not shared or mutated elsewhere), so assigning onto it
      // directly is safe and avoids the shallow-copy overhead of spreading into a new object.
      summary.category = metadata.category;
      summary.serie = metadata.serie;
      summary.tags = metadata.tags;
      return summary;
    })
    .sort((a, b) => compareNatural(a.name, b.name));

  const poses = toPoseSummaries(state.poseCounter);
  const metadataFilterOptions = buildMetadataFilterOptions(characters);
  const characterMetadataFilterIdsByName = buildCharacterMetadataFilterIdsByName(
    characters,
    metadataFilterOptions,
  );
  const poseFilterOptions = buildPoseFilterOptions(poses, posePatternFilters);

  return {
    rootConfigured: true,
    rootPath,
    defaultStyle: styleConfig.defaultStyle,
    styles: styleConfig.styles,
    styleLabels: styleConfig.styleLabels,
    animations: styleConfig.animations,
    images: state.imageItems,
    characters,
    poses,
    posePatternFilters,
    poseFilterOptions,
    metadataFilterOptions,
    characterMetadataFilterIdsByName,
    warning: null,
    cacheAvailable,
  };
};

export const readImageLibrary = async (): Promise<ILibraryData> => {
  const rootPath = getImagesRootPathFromEnv();
  const fallbackStyleConfig: IStyleConfig = {
    styles: [...STYLES],
    defaultStyle: DEFAULT_STYLE,
    styleLabels: {},
    animations: [],
  };

  if (!rootPath) {
    return createEmptyLibraryData(
      false,
      null,
      `Set ${SD_IMAGES_ROOT_ENV_KEY} to the folder that contains characters/{style}/{character}/*.png`,
      fallbackStyleConfig,
    );
  }

  const styleConfig = await readStyleConfig(rootPath);
  const charactersRootPath = path.join(rootPath, "characters");
  let metadataByCharacter = new Map<string, ICharacterMetadataSummary>();
  const posePatternFilters = await readPosePatternFilters(rootPath);
  const extraRootPaths = getExtraImagesRootPathsFromEnv();

  const cachedLibrary = await readLibraryIndexCache(rootPath, charactersRootPath, extraRootPaths);
  if (cachedLibrary) {
    return cachedLibrary;
  }

  try {
    metadataByCharacter = await readCharactersMetadata(rootPath);
  } catch {
    metadataByCharacter = new Map<string, ICharacterMetadataSummary>();
  }

  let availableStyles: string[] = [];

  try {
    availableStyles = await resolveStyleFolders(charactersRootPath, styleConfig.styles);
  } catch {
    return createEmptyLibraryData(
      true,
      rootPath,
      `Could not read ${path.join(rootPath, "characters")}. Ensure the folder exists and is readable.`,
      styleConfig,
    );
  }

  const effectiveStyleConfig: IStyleConfig = {
    ...styleConfig,
    defaultStyle:
      availableStyles.length > 0
        ? resolveDefaultStyle(availableStyles, styleConfig.defaultStyle)
        : styleConfig.defaultStyle,
  };

  const styleStates = await Promise.all(
    availableStyles.map(async (style) => {
      const stylePath = path.join(charactersRootPath, style);
      const styleState = createLibraryIndexState();
      await indexStyleFolder(style, stylePath, styleState, MAIN_ROOT_CONTEXT);
      return styleState;
    }),
  );

  const extraRootStates = await indexExtraImageRoots(extraRootPaths, availableStyles);

  const indexState = createLibraryIndexState();
  for (const styleState of [...styleStates, ...extraRootStates]) {
    mergeIndexState(indexState, styleState);
  }

  sortImageItems(indexState.imageItems);
  applyPosePatternFilterIds(indexState.imageItems, posePatternFilters);
  await reconcilePendingAnimationMarks(
    rootPath,
    indexState.imageItems,
    effectiveStyleConfig.animations,
  );
  const { available: cacheAvailable } = await syncFirstSeenCache(rootPath, indexState.imageItems);

  const library = toLibraryData(
    rootPath,
    effectiveStyleConfig,
    indexState,
    metadataByCharacter,
    posePatternFilters,
    cacheAvailable,
  );

  const libraryCacheWritable = await writeLibraryIndexCache(
    rootPath,
    charactersRootPath,
    extraRootPaths,
    library,
  );

  return { ...library, cacheAvailable: cacheAvailable && libraryCacheWritable };
};
