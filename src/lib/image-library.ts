import { promises as fs } from "node:fs";
import path from "node:path";
import {
  STYLES,
  type ICharacterSummary,
  type IImageItem,
  type ILibraryData,
  type IPoseSummary,
  type TStyle,
} from "@/types/library";
import { ensureLocalEnvLoaded } from "@/lib/env";
import { SD_CACHE_DIR_ENV_KEY, SD_IMAGES_ROOT_ENV_KEY } from "@/lib/env-keys";

const DEFAULT_STYLE: TStyle = "3d";
const PNG_EXTENSION = ".png";
const NEW_IMAGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_DIR_RELATIVE_PATH = path.join(".cache", "sd-character-viewer");
const FIRST_SEEN_CACHE_FILE_SUFFIX = ".first-seen.json";

interface ICharacterAccumulator {
  name: string;
  imageCount: number;
  styles: Set<TStyle>;
  poses: Set<string>;
  thumbnailsByStyle: Partial<Record<TStyle, string>>;
}

interface ICharacterMetadata {
  name: string;
  category: string;
  serie?: string;
}

interface ICharacterMetadataSummary {
  category: string;
  serie: string | null;
}

interface ILibraryIndexState {
  imageItems: IImageItem[];
  characterMap: Map<string, ICharacterAccumulator>;
  poseCounter: Map<string, number>;
}

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

const isCharacterMetadata = (value: unknown): value is ICharacterMetadata => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if (!keys.includes("name") || !keys.includes("category")) {
    return false;
  }

  const hasOnlyAllowedKeys = keys.every((key) => ["name", "category", "serie"].includes(key));

  if (!hasOnlyAllowedKeys) {
    return false;
  }

  if (typeof record.name !== "string" || typeof record.category !== "string") {
    return false;
  }

  if (record.serie !== undefined && typeof record.serie !== "string") {
    return false;
  }

  return true;
};

const readCharactersMetadata = async (
  rootPath: string,
): Promise<Map<string, ICharacterMetadataSummary>> => {
  const metadataPath = path.join(rootPath, "characters", "characters.json");

  let fileContent = "";
  try {
    fileContent = await fs.readFile(metadataPath, "utf8");
  } catch (error) {
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
    });
  }

  return metadataByCharacter;
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

const listPngFiles = async (characterFolderPath: string): Promise<string[]> => {
  const entries = await fs.readdir(characterFolderPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.toLowerCase().endsWith(PNG_EXTENSION));
};

const resolveStyleFolders = async (charactersRootPath: string): Promise<TStyle[]> => {
  const styleEntries = await fs.readdir(charactersRootPath, { withFileTypes: true });

  return STYLES.filter((style) => {
    return styleEntries.some((entry) => entry.isDirectory() && entry.name === style);
  });
};

const toCharacterSummary = (accumulator: ICharacterAccumulator): ICharacterSummary => {
  return {
    name: accumulator.name,
    imageCount: accumulator.imageCount,
    poseCount: accumulator.poses.size,
    styles: [...accumulator.styles].sort(compareNatural),
    thumbnailsByStyle: accumulator.thumbnailsByStyle,
    category: null,
    serie: null,
  };
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
  cacheAvailable: boolean = false,
): ILibraryData => {
  return {
    rootConfigured,
    rootPath,
    defaultStyle: DEFAULT_STYLE,
    styles: [...STYLES],
    images: [],
    characters: [],
    poses: [],
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

const buildImageItem = (style: TStyle, characterName: string, pngFile: string): IImageItem => {
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
  style: TStyle,
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
  style: TStyle,
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
  state: ILibraryIndexState,
  metadataByCharacter: Map<string, ICharacterMetadataSummary>,
  cacheAvailable: boolean,
): ILibraryData => {
  const characters = [...state.characterMap.values()]
    .map((accumulator) => {
      const summary = toCharacterSummary(accumulator);
      const metadata = metadataByCharacter.get(normalizeCharacterNameKey(summary.name));

      if (!metadata) {
        return summary;
      }

      return {
        ...summary,
        category: metadata.category,
        serie: metadata.serie,
      };
    })
    .sort((a, b) => compareNatural(a.name, b.name));

  const poses = toPoseSummaries(state.poseCounter);

  return {
    rootConfigured: true,
    rootPath,
    defaultStyle: DEFAULT_STYLE,
    styles: [...STYLES],
    images: state.imageItems,
    characters,
    poses,
    warning: null,
    cacheAvailable,
  };
};

const getImagesRootPathFromEnv = (): string | null => {
  ensureLocalEnvLoaded();
  const configuredRoot = process.env[SD_IMAGES_ROOT_ENV_KEY]?.trim();
  return configuredRoot || null;
};

export const readImageLibrary = async (): Promise<ILibraryData> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return createEmptyLibraryData(
      false,
      null,
      `Set ${SD_IMAGES_ROOT_ENV_KEY} to the folder that contains characters/{style}/{character}/*.png`,
    );
  }

  const charactersRootPath = path.join(rootPath, "characters");
  let metadataByCharacter = new Map<string, ICharacterMetadataSummary>();

  try {
    metadataByCharacter = await readCharactersMetadata(rootPath);
  } catch {
    metadataByCharacter = new Map<string, ICharacterMetadataSummary>();
  }

  let availableStyles: TStyle[] = [];
  try {
    availableStyles = await resolveStyleFolders(charactersRootPath);
  } catch {
    return createEmptyLibraryData(
      true,
      rootPath,
      `Could not read ${path.join(rootPath, "characters")}. Ensure the folder exists and is readable.`,
    );
  }

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

  return toLibraryData(rootPath, indexState, metadataByCharacter, cacheAvailable);
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
