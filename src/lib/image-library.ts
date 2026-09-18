import Ajv from "ajv";
import { promises as fs } from "node:fs";
import path from "node:path";

import { ensureLocalEnvLoaded } from "@/lib/env";
import {
  SD_CACHE_DIR_ENV_KEY,
  SD_EXTRA_IMAGES_ROOT_ENV_KEY,
  SD_IMAGES_ROOT_ENV_KEY,
} from "@/lib/env-keys";
import {
  buildExtraRootRelativePrefix,
  EXTRA_ROOT_PATH_SEGMENT,
  resolveExtraImageRoots,
} from "@/lib/extra-image-roots";
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
  type TMediaType,
} from "@/types/library";

const DEFAULT_STYLE: string = "3d";
const PNG_EXTENSION = ".png";
const VIDEO_EXTENSION = ".mp4";
const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([PNG_EXTENSION, VIDEO_EXTENSION]);
const NEW_IMAGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_DIR_RELATIVE_PATH = path.join(".cache", "sd-character-viewer");
const FIRST_SEEN_CACHE_FILE_SUFFIX = ".first-seen.json";
const LIBRARY_INDEX_CACHE_FILE_SUFFIX = ".library-index.json";
// Bumped whenever a cached ILibraryData's shape changes, so a cache written by an older version
// of the app (e.g. one predating the `mediaType` field) is treated as a miss and rebuilt, rather
// than being returned as-is with the new field silently undefined.
const LIBRARY_INDEX_CACHE_VERSION = 7;
const PREVIEW_FILE_SUFFIX = ".preview.jpg";
// Video previews use a distinct suffix/extension from image previews: the running app never
// generates them itself (no ffmpeg invoked at request time), only the offline sync script
// (via ffmpeg) or an operator can provide one.
const VIDEO_PREVIEW_FILE_SUFFIX = ".preview.png";
const LIBRARY_CONFIG_FILE_NAME = "config.json";
const CHARACTERS_CONFIG_FILE_NAME = "characters.json";
const POSE_FILTERS_FILE_NAME = "pose-filters.json";
const DUPLICATE_REVIEW_CONFIG_FILE_NAME = "duplicate-reviews.json";
const TO_UPSCALE_FILE_NAME = "to-upscale.json";
const TO_ANIMATE_FILE_NAME = "to-animate.json";
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

export interface IToAnimateEntry {
  metadata: string;
  action: string;
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

interface ICacheFileSnapshot {
  relativePath: string;
  modifiedAt: number;
}

interface ILibraryIndexCacheFile {
  version: number;
  rootPath: string;
  generatedAt: number;
  configFiles: ICacheFileSnapshot[];
  directories: ICacheFileSnapshot[];
  extraRootPaths: string[];
  extraDirectories: ICacheFileSnapshot[];
  library: ILibraryData;
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

// A single raw `animations` entry: either a plain string (legacy leaf, auto-migrated to
// {key: s, name: s, prompt: ""}) or an object node with required key/name strings, an optional
// prompt string (defaulting to ""), and optional recursively-normalized subVersions. Anything
// else (wrong types, missing key/name) is silently skipped, matching readMarkedImageMap's
// existing leniency toward malformed entries elsewhere in this file. `seenKeys` is shared across
// the whole tree (not just siblings), since findAnimationNodeByKey resolves by key alone: a key
// reused at a different nesting level would otherwise shadow the earlier node and make the
// later one unreachable (and produce duplicate React keys in the flattened UI menu).
const normalizeAnimationConfigEntry = (
  entry: unknown,
  seenKeys: Set<string>,
): IAnimationConfig | null => {
  if (typeof entry === "string") {
    const trimmedName = entry.trim();
    if (!trimmedName || seenKeys.has(trimmedName)) {
      return null;
    }
    seenKeys.add(trimmedName);
    return { key: trimmedName, name: trimmedName, prompt: "" };
  }

  if (!isPlainObjectRecord(entry)) {
    return null;
  }

  const key = typeof entry.key === "string" ? entry.key.trim() : "";
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!key || !name || seenKeys.has(key)) {
    return null;
  }
  seenKeys.add(key);

  const prompt = typeof entry.prompt === "string" ? entry.prompt : "";
  const subVersions = Array.isArray(entry.subVersions)
    ? normalizeAnimationEntries(entry.subVersions, seenKeys)
    : [];

  return subVersions.length > 0 ? { key, name, prompt, subVersions } : { key, name, prompt };
};

const normalizeAnimationEntries = (raw: unknown[], seenKeys: Set<string>): IAnimationConfig[] => {
  const nodes: IAnimationConfig[] = [];

  for (const rawEntry of raw) {
    const node = normalizeAnimationConfigEntry(rawEntry, seenKeys);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
};

export const normalizeAnimationsConfig = (raw: unknown): IAnimationConfig[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return normalizeAnimationEntries(raw, new Set<string>());
};

export const findAnimationNodeByKey = (
  animations: IAnimationConfig[],
  key: string,
): IAnimationConfig | null => {
  for (const node of animations) {
    if (node.key === key) {
      return node;
    }

    const foundInSubVersions = node.subVersions
      ? findAnimationNodeByKey(node.subVersions, key)
      : null;
    if (foundInSubVersions) {
      return foundInSubVersions;
    }
  }

  return null;
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

const normalizeRelativePath = (filePath: string): string => {
  return filePath.split(path.sep).join(path.posix.sep);
};

const compareNatural = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

const parseExtraRootRelativePath = (
  relativePath: string,
): { extraRootIndex: number; remainder: string } | null => {
  const match = new RegExp(String.raw`^${EXTRA_ROOT_PATH_SEGMENT}/(\d+)/(.+)$`).exec(relativePath);

  if (!match) {
    return null;
  }

  return {
    extraRootIndex: Number.parseInt(match[1], 10),
    remainder: match[2],
  };
};

// Returns "" for a main-root relativePath, or the "extra-roots/<index>" prefix to reconstruct
// a relativePath under the same extra root as the one passed in.
export const getRelativePathRootPrefix = (relativePath: string): string => {
  const extraRootMatch = parseExtraRootRelativePath(relativePath);
  return extraRootMatch ? buildExtraRootRelativePrefix(extraRootMatch.extraRootIndex) : "";
};

export const getExtraImagesRootPathsFromEnv = (): string[] => {
  ensureLocalEnvLoaded();
  return resolveExtraImageRoots(process.env[SD_EXTRA_IMAGES_ROOT_ENV_KEY]);
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

const isPlainObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isToAnimateEntry = (value: unknown): value is IToAnimateEntry => {
  return (
    isPlainObjectRecord(value) &&
    typeof value.metadata === "string" &&
    typeof value.action === "string"
  );
};

const isRawMetadataEntry = (value: unknown): value is string => typeof value === "string";

const readMarkedImageMap = async <T>(
  filePath: string,
  isValidEntry: (value: unknown) => value is T,
): Promise<Record<string, T>> => {
  let fileContent = "";
  try {
    fileContent = await fs.readFile(filePath, "utf8");
  } catch {
    return {};
  }

  try {
    const parsedContent: unknown = JSON.parse(fileContent);
    if (!isPlainObjectRecord(parsedContent)) {
      return {};
    }

    const entries: Record<string, T> = {};
    for (const [relativePath, entry] of Object.entries(parsedContent)) {
      if (isValidEntry(entry)) {
        entries[relativePath] = entry;
      }
    }

    return entries;
  } catch {
    // Fallback to no entries when the file is malformed.
    return {};
  }
};

const writeMarkedImageMap = async (
  filePath: string,
  entries: Record<string, unknown>,
): Promise<void> => {
  await fs.writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
};

// Serializes read-modify-write cycles against a single marker file (to-upscale.json /
// to-animate.json), keyed by its absolute path. Without this, two concurrent marks (or a mark
// and an unmark) can both read the file before either writes it back, and the second write
// silently clobbers the first one's change.
const markedImageFileQueues = new Map<string, Promise<unknown>>();

const withMarkedImageFileLock = <T>(filePath: string, task: () => Promise<T>): Promise<T> => {
  const previousTask = markedImageFileQueues.get(filePath) ?? Promise.resolve();
  const nextTask = previousTask.then(task, task);
  markedImageFileQueues.set(
    filePath,
    nextTask.catch(() => {}),
  );
  return nextTask;
};

export const readToUpscaleEntries = async (rootPath: string): Promise<Record<string, string>> => {
  return readMarkedImageMap(path.join(rootPath, TO_UPSCALE_FILE_NAME), isRawMetadataEntry);
};

export const setToUpscaleEntry = async (
  rootPath: string,
  relativePath: string,
  metadata: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_UPSCALE_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isRawMetadataEntry);
    entries[relativePath] = metadata;
    await writeMarkedImageMap(filePath, entries);
  });
};

export const removeToUpscaleEntry = async (
  rootPath: string,
  relativePath: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_UPSCALE_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isRawMetadataEntry);
    if (relativePath in entries) {
      delete entries[relativePath];
      await writeMarkedImageMap(filePath, entries);
    }
  });
};

export const readToAnimateEntries = async (
  rootPath: string,
): Promise<Record<string, IToAnimateEntry>> => {
  return readMarkedImageMap(path.join(rootPath, TO_ANIMATE_FILE_NAME), isToAnimateEntry);
};

export const setToAnimateEntry = async (
  rootPath: string,
  relativePath: string,
  metadata: string,
  action: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_ANIMATE_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isToAnimateEntry);
    entries[relativePath] = { metadata, action };
    await writeMarkedImageMap(filePath, entries);
  });
};

export const removeToAnimateEntry = async (
  rootPath: string,
  relativePath: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_ANIMATE_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isToAnimateEntry);
    if (relativePath in entries) {
      delete entries[relativePath];
      await writeMarkedImageMap(filePath, entries);
    }
  });
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

// A video's own preview sidecar (e.g. "Base.preview.png") ends in ".png", so it must be excluded
// explicitly once ".png" is treated as a generic media extension, or it would be misindexed as a
// standalone image alongside the video it belongs to.
const isPreviewSidecarFileName = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return lower.endsWith(PREVIEW_FILE_SUFFIX) || lower.endsWith(VIDEO_PREVIEW_FILE_SUFFIX);
};

export const isVideoFilePath = (filePath: string): boolean => {
  return path.extname(filePath).toLowerCase() === VIDEO_EXTENSION;
};

const getMediaTypeForFileName = (fileName: string): TMediaType => {
  return isVideoFilePath(fileName) ? "video" : "image";
};

const listMediaFiles = async (characterFolderPath: string): Promise<string[]> => {
  const entries = await fs.readdir(characterFolderPath, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => !isPreviewSidecarFileName(fileName))
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

const toCacheFileNameForRoot = (rootPath: string, suffix: string): string => {
  const rootHash = Buffer.from(path.resolve(rootPath)).toString("base64url");
  return `${rootHash}${suffix}`;
};

const getCacheDirectoryPath = (): string => {
  const configuredCacheDir = process.env[SD_CACHE_DIR_ENV_KEY]?.trim();

  if (configuredCacheDir) {
    return path.resolve(configuredCacheDir);
  }

  return path.resolve(process.cwd(), DEFAULT_CACHE_DIR_RELATIVE_PATH);
};

const getFirstSeenCachePath = (rootPath: string): string => {
  return path.join(
    getCacheDirectoryPath(),
    toCacheFileNameForRoot(rootPath, FIRST_SEEN_CACHE_FILE_SUFFIX),
  );
};

const getLibraryIndexCachePath = (rootPath: string): string => {
  return path.join(
    getCacheDirectoryPath(),
    toCacheFileNameForRoot(rootPath, LIBRARY_INDEX_CACHE_FILE_SUFFIX),
  );
};

const toRelativeCachePath = (rootPath: string, absolutePath: string): string => {
  return normalizeRelativePath(path.relative(rootPath, absolutePath));
};

const getFileSnapshot = async (
  rootPath: string,
  absolutePath: string,
): Promise<ICacheFileSnapshot | null> => {
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }

  return {
    relativePath: toRelativeCachePath(rootPath, absolutePath),
    modifiedAt: Math.trunc(stat.mtimeMs),
  };
};

const collectConfigFileSnapshots = async (rootPath: string): Promise<ICacheFileSnapshot[]> => {
  const configPaths = [
    path.join(rootPath, LIBRARY_CONFIG_FILE_NAME),
    path.join(rootPath, POSE_FILTERS_FILE_NAME),
    path.join(rootPath, "characters", CHARACTERS_CONFIG_FILE_NAME),
  ];
  const snapshots = await Promise.all(
    configPaths.map((configPath) => getFileSnapshot(rootPath, configPath)),
  );
  return snapshots.filter((snapshot): snapshot is ICacheFileSnapshot => snapshot !== null);
};

const collectDirectorySnapshots = async (
  rootPath: string,
  directoryPath: string,
): Promise<ICacheFileSnapshot[]> => {
  const directoryStat = await fs.stat(directoryPath);
  const snapshots: ICacheFileSnapshot[] = [
    {
      relativePath: toRelativeCachePath(rootPath, directoryPath),
      modifiedAt: Math.trunc(directoryStat.mtimeMs),
    },
  ];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childSnapshots = await collectDirectorySnapshots(
      rootPath,
      path.join(directoryPath, entry.name),
    );
    snapshots.push(...childSnapshots);
  }

  return snapshots.sort((a, b) => compareNatural(a.relativePath, b.relativePath));
};

const areSnapshotsEqual = (
  currentSnapshots: ICacheFileSnapshot[],
  cachedSnapshots: ICacheFileSnapshot[],
): boolean => {
  if (currentSnapshots.length !== cachedSnapshots.length) {
    return false;
  }

  return currentSnapshots.every((snapshot, index) => {
    const cachedSnapshot = cachedSnapshots[index];
    return (
      cachedSnapshot?.relativePath === snapshot.relativePath &&
      cachedSnapshot.modifiedAt === snapshot.modifiedAt
    );
  });
};

const areStringArraysEqual = (a: string[], b: string[]): boolean => {
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

// Snapshots every extra root's "characters" tree, tagging each entry's relativePath with the
// root's index so entries never collide across roots and so a change to the resolved list of
// extra roots itself (one added/removed/reordered) is caught by comparing extraRootPaths too.
const collectExtraDirectorySnapshots = async (
  extraRootPaths: string[],
): Promise<ICacheFileSnapshot[]> => {
  const snapshotsByRoot = await Promise.all(
    extraRootPaths.map(async (extraRootPath, extraRootIndex) => {
      try {
        const snapshots = await collectDirectorySnapshots(
          extraRootPath,
          path.join(extraRootPath, "characters"),
        );
        return snapshots.map((snapshot) => ({
          relativePath: `${extraRootIndex}/${snapshot.relativePath}`,
          modifiedAt: snapshot.modifiedAt,
        }));
      } catch {
        return [];
      }
    }),
  );

  return snapshotsByRoot.flat();
};

const refreshCachedLibrary = (library: ILibraryData): ILibraryData => {
  const now = Date.now();
  return {
    ...library,
    images: library.images.map((image) => ({
      ...image,
      isNew: now - image.firstSeenAt <= NEW_IMAGE_WINDOW_MS,
    })),
    cacheAvailable: true,
  };
};

const readLibraryIndexCache = async (
  rootPath: string,
  charactersRootPath: string,
  extraRootPaths: string[],
): Promise<ILibraryData | null> => {
  const cachePath = getLibraryIndexCachePath(rootPath);

  try {
    const rawContent = await fs.readFile(cachePath, "utf8");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const cacheFile = JSON.parse(rawContent) as ILibraryIndexCacheFile;

    if (
      cacheFile.version !== LIBRARY_INDEX_CACHE_VERSION ||
      cacheFile.rootPath !== path.resolve(rootPath) ||
      !cacheFile.library?.rootConfigured ||
      !areStringArraysEqual(cacheFile.extraRootPaths ?? [], extraRootPaths)
    ) {
      return null;
    }

    const [configFiles, directories, extraDirectories] = await Promise.all([
      collectConfigFileSnapshots(rootPath),
      collectDirectorySnapshots(rootPath, charactersRootPath),
      collectExtraDirectorySnapshots(extraRootPaths),
    ]);

    if (
      !areSnapshotsEqual(configFiles, cacheFile.configFiles) ||
      !areSnapshotsEqual(directories, cacheFile.directories) ||
      !areSnapshotsEqual(extraDirectories, cacheFile.extraDirectories ?? [])
    ) {
      return null;
    }

    return refreshCachedLibrary(cacheFile.library);
  } catch {
    return null;
  }
};

const writeLibraryIndexCache = async (
  rootPath: string,
  charactersRootPath: string,
  extraRootPaths: string[],
  library: ILibraryData,
): Promise<boolean> => {
  const cachePath = getLibraryIndexCachePath(rootPath);

  try {
    const [configFiles, directories, extraDirectories] = await Promise.all([
      collectConfigFileSnapshots(rootPath),
      collectDirectorySnapshots(rootPath, charactersRootPath),
      collectExtraDirectorySnapshots(extraRootPaths),
    ]);
    const cacheFile: ILibraryIndexCacheFile = {
      version: LIBRARY_INDEX_CACHE_VERSION,
      rootPath: path.resolve(rootPath),
      generatedAt: Date.now(),
      configFiles,
      directories,
      extraRootPaths,
      extraDirectories,
      library: { ...library, cacheAvailable: true },
    };

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(cacheFile, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
};

export const removeLibraryIndexCache = async (): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  await fs.unlink(getLibraryIndexCachePath(rootPath)).catch(() => {});
};

const loadFirstSeenCache = async (
  rootPath: string,
): Promise<{ cache: Map<string, number>; available: boolean }> => {
  const cachePath = getFirstSeenCachePath(rootPath);

  try {
    const rawContent = await fs.readFile(cachePath, "utf8");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const parsedContent = JSON.parse(rawContent) as Record<string, unknown>;
    const cacheMap = new Map<string, number>();

    for (const [relativePath, firstSeenAt] of Object.entries(parsedContent)) {
      if (typeof relativePath !== "string") {
        continue;
      }

      if (typeof firstSeenAt !== "number" || !Number.isFinite(firstSeenAt) || firstSeenAt < 0) {
        continue;
      }

      cacheMap.set(relativePath, firstSeenAt);
    }

    return { cache: cacheMap, available: true };
  } catch (error) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { cache: new Map<string, number>(), available: true };
    }

    return { cache: new Map<string, number>(), available: false };
  }
};

const persistFirstSeenCache = async (
  rootPath: string,
  firstSeenByRelativePath: Map<string, number>,
): Promise<boolean> => {
  const cachePath = getFirstSeenCachePath(rootPath);
  const cacheDirPath = path.dirname(cachePath);
  const serializable = Object.fromEntries(
    [...firstSeenByRelativePath.entries()].sort((a, b) => compareNatural(a[0], b[0])),
  );

  try {
    await fs.mkdir(cacheDirPath, { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
    return true;
  } catch {
    // Ignore persistence failures to keep the library endpoint resilient.
    return false;
  }
};

const markNewImages = (
  imageItems: IImageItem[],
  now: number,
  firstSeenByRelativePath: Map<string, number>,
): boolean => {
  let hasChanges = false;
  const activeRelativePaths = new Set<string>();

  for (const imageItem of imageItems) {
    const cacheKey = imageItem.relativePath;
    activeRelativePaths.add(cacheKey);

    const firstSeenAt = firstSeenByRelativePath.get(cacheKey) ?? now;
    if (!firstSeenByRelativePath.has(cacheKey)) {
      firstSeenByRelativePath.set(cacheKey, firstSeenAt);
      hasChanges = true;
    }

    imageItem.isNew = now - firstSeenAt <= NEW_IMAGE_WINDOW_MS;
    imageItem.firstSeenAt = firstSeenAt;
  }

  for (const [cacheKey, firstSeenAt] of firstSeenByRelativePath.entries()) {
    const isStaleAndNotActive =
      !activeRelativePaths.has(cacheKey) && now - firstSeenAt > NEW_IMAGE_WINDOW_MS;
    if (isStaleAndNotActive) {
      firstSeenByRelativePath.delete(cacheKey);
      hasChanges = true;
    }
  }

  return hasChanges;
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

  for (const mediaFile of mediaFiles) {
    const imagePath = path.join(characterFolderPath, mediaFile);
    const stat = await fs.stat(imagePath);
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

  for (const characterEntry of characterEntries) {
    if (!characterEntry.isDirectory()) {
      continue;
    }

    const characterName = characterEntry.name;
    const characterFolderPath = path.join(stylePath, characterName);
    await indexCharacterFolder(style, characterName, characterFolderPath, state, rootContext);
  }
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

      return {
        ...summary,
        category: metadata.category,
        serie: metadata.serie,
        tags: metadata.tags,
      };
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

export const getImagesRootPathFromEnv = (): string | null => {
  ensureLocalEnvLoaded();
  const configuredRoot = process.env[SD_IMAGES_ROOT_ENV_KEY]?.trim();
  return configuredRoot || null;
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
  const { cache: firstSeenCache, available: cacheReadable } = await loadFirstSeenCache(rootPath);
  const hasCacheChanges = markNewImages(indexState.imageItems, Date.now(), firstSeenCache);

  let cacheWritable = true;
  if (hasCacheChanges) {
    cacheWritable = await persistFirstSeenCache(rootPath, firstSeenCache);
  }

  const cacheAvailable = cacheReadable && cacheWritable;

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

const resolveFilePathUnderRoot = (rootPath: string, relativePath: string): string | null => {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return null;
  }

  const normalizedRelative = path.normalize(relativePath);

  if (normalizedRelative.startsWith("..") || normalizedRelative.includes(`..${path.sep}`)) {
    return null;
  }

  const fullPath = path.resolve(rootPath, normalizedRelative);
  // Media only ever lives under "characters/{style}/{character}/*.png|*.mp4" (see
  // readImageLibrary), so containment is scoped to that subtree rather than the whole root -
  // otherwise any other *.png/*.mp4 file placed directly under the root (e.g. next to
  // config.json) would be readable or deletable through this endpoint.
  const resolvedCharactersRootPath = path.resolve(rootPath, "characters");
  const isInsideCharactersRoot =
    fullPath === resolvedCharactersRootPath ||
    fullPath.startsWith(`${resolvedCharactersRootPath}${path.sep}`);

  if (!isInsideCharactersRoot || !MEDIA_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
    return null;
  }

  return fullPath;
};

export const resolveImageFilePath = (relativePath: string): string | null => {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return null;
  }

  const extraRootMatch = parseExtraRootRelativePath(relativePath);

  if (extraRootMatch) {
    const extraRootPath = getExtraImagesRootPathsFromEnv()[extraRootMatch.extraRootIndex];

    if (!extraRootPath) {
      return null;
    }

    return resolveFilePathUnderRoot(extraRootPath, extraRootMatch.remainder);
  }

  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return null;
  }

  return resolveFilePathUnderRoot(rootPath, relativePath);
};

export const resolvePreviewFilePath = (mediaFilePath: string): string => {
  const extension = path.extname(mediaFilePath);
  const suffix = isVideoFilePath(mediaFilePath) ? VIDEO_PREVIEW_FILE_SUFFIX : PREVIEW_FILE_SUFFIX;
  return `${mediaFilePath.slice(0, -extension.length)}${suffix}`;
};

export const removeFirstSeenCacheEntry = async (relativePath: string): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  const normalizedPath = normalizeRelativePath(relativePath);
  const { cache: firstSeenCache } = await loadFirstSeenCache(rootPath);

  if (firstSeenCache.has(normalizedPath)) {
    firstSeenCache.delete(normalizedPath);
    await persistFirstSeenCache(rootPath, firstSeenCache);
  }
};

// Called after an image is deleted or renamed (the old relativePath no longer refers to that
// image), so any pending upscale/animate mark tied to it is dropped rather than left dangling.
// Best-effort: the delete/rename it follows has already happened on disk, so a failure to clean
// up a mark (e.g. a transient disk error) must not surface as a failure of that larger operation.
export const removeMarkedActionEntries = async (relativePath: string): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  const normalizedPath = normalizeRelativePath(relativePath);

  try {
    await Promise.all([
      removeToUpscaleEntry(rootPath, normalizedPath),
      removeToAnimateEntry(rootPath, normalizedPath),
    ]);
  } catch {
    // Ignore: see comment above.
  }
};
