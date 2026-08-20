import Ajv from "ajv";
import { promises as fs } from "node:fs";
import path from "node:path";

import { ensureLocalEnvLoaded } from "@/lib/env";
import { SD_CACHE_DIR_ENV_KEY, SD_IMAGES_ROOT_ENV_KEY } from "@/lib/env-keys";
import {
  STYLES,
  type ICharacterSummary,
  type IDuplicateGroup,
  type IImageItem,
  type ILibraryData,
  type IPosePatternFilter,
  type IPoseSummary,
} from "@/types/library";

const DEFAULT_STYLE: string = "3d";
const PNG_EXTENSION = ".png";
const NEW_IMAGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_DIR_RELATIVE_PATH = path.join(".cache", "sd-character-viewer");
const FIRST_SEEN_CACHE_FILE_SUFFIX = ".first-seen.json";
const PREVIEW_FILE_SUFFIX = ".preview.jpg";
const LIBRARY_CONFIG_FILE_NAME = "config.json";
const CHARACTERS_CONFIG_FILE_NAME = "characters.json";
const POSE_FILTERS_FILE_NAME = "pose-filters.json";
const DUPLICATE_REVIEW_CONFIG_FILE_NAME = "duplicate-reviews.json";
const DEFAULT_POSE_PATTERN_FILTER_CONFIGS = [{ label: "With Somebody", pattern: "^With " }];

interface ILibraryConfig {
  styles?: string[];
  defaultStyle?: string;
  styleLabels?: Record<string, string>;
}

interface IStyleConfig {
  styles: string[];
  defaultStyle: string;
  styleLabels: Partial<Record<string, string>>;
}

interface ICharacterAccumulator {
  name: string;
  imageCount: number;
  styles: Set<string>;
  poses: Set<string>;
  thumbnailsByStyle: Partial<Record<string, string>>;
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
      };
    }

    return {
      styles: fallbackStyles,
      defaultStyle: DEFAULT_STYLE,
      styleLabels: fallbackStyleLabels,
    };
  }

  try {
    const parsedContent: unknown = JSON.parse(fileContent);

    if (!isLibraryConfig(parsedContent)) {
      return {
        styles: fallbackStyles,
        defaultStyle: DEFAULT_STYLE,
        styleLabels: fallbackStyleLabels,
      };
    }

    const styles = normalizeStyleNames(parsedContent.styles);
    if (styles.length === 0) {
      return {
        styles: fallbackStyles,
        defaultStyle: DEFAULT_STYLE,
        styleLabels: fallbackStyleLabels,
      };
    }

    return {
      styles,
      defaultStyle: resolveDefaultStyle(styles, parsedContent.defaultStyle),
      styleLabels: normalizeStyleLabels(styles, parsedContent.styleLabels),
    };
  } catch {
    // Fallback to legacy defaults when config.json is malformed.
    return {
      styles: fallbackStyles,
      defaultStyle: DEFAULT_STYLE,
      styleLabels: fallbackStyleLabels,
    };
  }
};

const normalizeRelativePath = (filePath: string): string => {
  return filePath.split(path.sep).join(path.posix.sep);
};

const compareNatural = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

const sanitizePoseName = (rawPoseName: string): string => {
  return rawPoseName.replace(/[_-]+/g, " ").trim();
};

const normalizeCharacterNameKey = (characterName: string): string => {
  return characterName.trim().toLowerCase();
};

const normalizeMetadataTags = (tags: string[] | undefined): string[] => {
  if (!tags) {
    return [];
  }

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))].sort(
    compareNatural,
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
  const poseRegex = /^(.*?)(\d+)?$/;
  const poseMatch = poseRegex.exec(cleanName);

  if (!poseMatch) {
    return {
      poseName: cleanName,
      poseBaseName: cleanName,
      poseVariant: 1,
    };
  }

  const poseBaseName = (poseMatch[1] ?? cleanName).trim();
  const variantRaw = poseMatch[2];

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
    const groupKey = `${image.style}::${image.characterName}::${image.poseBaseName}`;
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

  return reviewedGroups.some((reviewedGroup) => {
    if (
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

const listPngFiles = async (characterFolderPath: string): Promise<string[]> => {
  const entries = await fs.readdir(characterFolderPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.toLowerCase().endsWith(PNG_EXTENSION));
};

const resolveStyleFolders = async (
  charactersRootPath: string,
  configuredStyles: string[],
): Promise<string[]> => {
  const styleEntries = await fs.readdir(charactersRootPath, { withFileTypes: true });

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
    images: [],
    characters: [],
    poses: [],
    posePatternFilters: normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS),
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

const buildImageItem = (style: string, characterName: string, pngFile: string): IImageItem => {
  const parsedPose = parsePoseName(pngFile);
  const relativePath = normalizeRelativePath(
    path.join("characters", style, characterName, pngFile),
  );

  return {
    id: `${style}::${characterName}::${pngFile}`,
    style,
    characterName,
    poseName: parsedPose.poseName,
    poseBaseName: parsedPose.poseBaseName,
    poseVariant: parsedPose.poseVariant,
    relativePath,
    isNew: false,
    firstSeenAt: 0,
  };
};

const toCacheFileNameForRoot = (rootPath: string): string => {
  const rootHash = Buffer.from(path.resolve(rootPath)).toString("base64url");
  return `${rootHash}${FIRST_SEEN_CACHE_FILE_SUFFIX}`;
};

const getCacheDirectoryPath = (): string => {
  const configuredCacheDir = process.env[SD_CACHE_DIR_ENV_KEY]?.trim();

  if (configuredCacheDir) {
    return path.resolve(configuredCacheDir);
  }

  return path.resolve(process.cwd(), DEFAULT_CACHE_DIR_RELATIVE_PATH);
};

const getFirstSeenCachePath = (rootPath: string): string => {
  return path.join(getCacheDirectoryPath(), toCacheFileNameForRoot(rootPath));
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
    }

    return;
  }

  const characterAccumulator: ICharacterAccumulator = {
    name: imageItem.characterName,
    imageCount: 1,
    styles: new Set([imageItem.style]),
    poses: new Set([imageItem.poseBaseName]),
    thumbnailsByStyle: isBasePose ? { [imageItem.style]: imageItem.relativePath } : {},
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

const indexCharacterFolder = async (
  style: string,
  characterName: string,
  characterFolderPath: string,
  state: ILibraryIndexState,
): Promise<void> => {
  const pngFiles = await listPngFiles(characterFolderPath);

  for (const pngFile of pngFiles) {
    const imageItem = buildImageItem(style, characterName, pngFile);
    state.imageItems.push(imageItem);
    updateCharacterAccumulator(state.characterMap, imageItem);
    incrementPoseCounter(state.poseCounter, imageItem.poseBaseName);
  }
};

const indexStyleFolder = async (
  style: string,
  stylePath: string,
  state: ILibraryIndexState,
): Promise<void> => {
  const characterEntries = await fs.readdir(stylePath, { withFileTypes: true });

  for (const characterEntry of characterEntries) {
    if (!characterEntry.isDirectory()) {
      continue;
    }

    const characterName = characterEntry.name;
    const characterFolderPath = path.join(stylePath, characterName);
    await indexCharacterFolder(style, characterName, characterFolderPath, state);
  }
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

  return {
    rootConfigured: true,
    rootPath,
    defaultStyle: styleConfig.defaultStyle,
    styles: styleConfig.styles,
    styleLabels: styleConfig.styleLabels,
    images: state.imageItems,
    characters,
    poses,
    posePatternFilters,
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
      await indexStyleFolder(style, stylePath, styleState);
      return styleState;
    }),
  );

  const indexState = createLibraryIndexState();
  for (const styleState of styleStates) {
    mergeIndexState(indexState, styleState);
  }

  sortImageItems(indexState.imageItems);
  const { cache: firstSeenCache, available: cacheReadable } = await loadFirstSeenCache(rootPath);
  const hasCacheChanges = markNewImages(indexState.imageItems, Date.now(), firstSeenCache);

  let cacheWritable = true;
  if (hasCacheChanges) {
    cacheWritable = await persistFirstSeenCache(rootPath, firstSeenCache);
  }

  const cacheAvailable = cacheReadable && cacheWritable;

  return toLibraryData(
    rootPath,
    effectiveStyleConfig,
    indexState,
    metadataByCharacter,
    posePatternFilters,
    cacheAvailable,
  );
};

export const resolveImageFilePath = (relativePath: string): string | null => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return null;
  }

  if (!relativePath || path.isAbsolute(relativePath)) {
    return null;
  }

  const normalizedRelative = path.normalize(relativePath);

  if (normalizedRelative.startsWith("..") || normalizedRelative.includes(`..${path.sep}`)) {
    return null;
  }

  const fullPath = path.resolve(rootPath, normalizedRelative);
  const resolvedRootPath = path.resolve(rootPath);
  const isInsideRoot =
    fullPath === resolvedRootPath || fullPath.startsWith(`${resolvedRootPath}${path.sep}`);

  if (!isInsideRoot || path.extname(fullPath).toLowerCase() !== PNG_EXTENSION) {
    return null;
  }

  return fullPath;
};

export const resolvePreviewFilePath = (pngFilePath: string): string => {
  const extension = path.extname(pngFilePath);
  return `${pngFilePath.slice(0, -extension.length)}${PREVIEW_FILE_SUFFIX}`;
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
