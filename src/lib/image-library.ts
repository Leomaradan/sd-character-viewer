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

const DEFAULT_STYLE: TStyle = "3d";
const IMAGE_ROOT_ENV_KEY = "SD_IMAGES_ROOT";
const PNG_EXTENSION = ".png";

interface ICharacterAccumulator {
  name: string;
  imageCount: number;
  styles: Set<TStyle>;
  poses: Set<string>;
  thumbnailsByStyle: Partial<Record<TStyle, string>>;
}

interface ILibraryIndexState {
  imageItems: IImageItem[];
  characterMap: Map<string, ICharacterAccumulator>;
  poseCounter: Map<string, number>;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sanitizePoseName(rawPoseName: string): string {
  return rawPoseName.replace(/[_-]+/g, " ").trim();
}

export function parsePoseName(fileName: string): {
  poseName: string;
  poseBaseName: string;
  poseVariant: number;
} {
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
}

async function listPngFiles(characterFolderPath: string): Promise<string[]> {
  const entries = await fs.readdir(characterFolderPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.toLowerCase().endsWith(PNG_EXTENSION));
}

async function resolveStyleFolders(charactersRootPath: string): Promise<TStyle[]> {
  const styleEntries = await fs.readdir(charactersRootPath, { withFileTypes: true });

  return STYLES.filter((style) => {
    return styleEntries.some((entry) => entry.isDirectory() && entry.name === style);
  });
}

function toCharacterSummary(accumulator: ICharacterAccumulator): ICharacterSummary {
  return {
    name: accumulator.name,
    imageCount: accumulator.imageCount,
    poseCount: accumulator.poses.size,
    styles: [...accumulator.styles].sort(compareNatural),
    thumbnailsByStyle: accumulator.thumbnailsByStyle,
  };
}

function toPoseSummaries(poseCounter: Map<string, number>): IPoseSummary[] {
  return [...poseCounter.entries()]
    .map(([name, imageCount]) => ({ name, imageCount }))
    .sort((a, b) => compareNatural(a.name, b.name));
}

function createEmptyLibraryData(
  rootConfigured: boolean,
  rootPath: string | null,
  warning: string | null,
): ILibraryData {
  return {
    rootConfigured,
    rootPath,
    defaultStyle: DEFAULT_STYLE,
    styles: [...STYLES],
    images: [],
    characters: [],
    poses: [],
    warning,
  };
}

function createLibraryIndexState(): ILibraryIndexState {
  return {
    imageItems: [],
    characterMap: new Map<string, ICharacterAccumulator>(),
    poseCounter: new Map<string, number>(),
  };
}

function buildImageItem(style: TStyle, characterName: string, pngFile: string): IImageItem {
  const parsedPose = parsePoseName(pngFile);
  const relativePath = normalizeRelativePath(path.join("characters", style, characterName, pngFile));

  return {
    id: `${style}::${characterName}::${pngFile}`,
    style,
    characterName,
    poseName: parsedPose.poseName,
    poseBaseName: parsedPose.poseBaseName,
    poseVariant: parsedPose.poseVariant,
    relativePath,
  };
}

function updateCharacterAccumulator(
  characterMap: Map<string, ICharacterAccumulator>,
  imageItem: IImageItem,
): void {
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
}

function incrementPoseCounter(poseCounter: Map<string, number>, poseBaseName: string): void {
  const currentPoseCount = poseCounter.get(poseBaseName) ?? 0;
  poseCounter.set(poseBaseName, currentPoseCount + 1);
}

function mergeIndexState(target: ILibraryIndexState, source: ILibraryIndexState): void {
  for (const imageItem of source.imageItems) {
    target.imageItems.push(imageItem);
    updateCharacterAccumulator(target.characterMap, imageItem);
    incrementPoseCounter(target.poseCounter, imageItem.poseBaseName);
  }
}

async function indexCharacterFolder(
  style: TStyle,
  characterName: string,
  characterFolderPath: string,
  state: ILibraryIndexState,
): Promise<void> {
  const pngFiles = await listPngFiles(characterFolderPath);

  for (const pngFile of pngFiles) {
    const imageItem = buildImageItem(style, characterName, pngFile);
    state.imageItems.push(imageItem);
    updateCharacterAccumulator(state.characterMap, imageItem);
    incrementPoseCounter(state.poseCounter, imageItem.poseBaseName);
  }
}

async function indexStyleFolder(
  style: TStyle,
  stylePath: string,
  state: ILibraryIndexState,
): Promise<void> {
  const characterEntries = await fs.readdir(stylePath, { withFileTypes: true });

  for (const characterEntry of characterEntries) {
    if (!characterEntry.isDirectory()) {
      continue;
    }

    const characterName = characterEntry.name;
    const characterFolderPath = path.join(stylePath, characterName);
    await indexCharacterFolder(style, characterName, characterFolderPath, state);
  }
}

function sortImageItems(imageItems: IImageItem[]): void {
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
}

function toLibraryData(rootPath: string, state: ILibraryIndexState): ILibraryData {
  const characters = [...state.characterMap.values()]
    .map(toCharacterSummary)
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
  };
}

export function getImagesRootPathFromEnv(): string | null {
  const configuredRoot = process.env[IMAGE_ROOT_ENV_KEY]?.trim();
  return configuredRoot || null;
}

export async function readImageLibrary(): Promise<ILibraryData> {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return createEmptyLibraryData(
      false,
      null,
      `Set ${IMAGE_ROOT_ENV_KEY} to the folder that contains characters/{style}/{character}/*.png`,
    );
  }

  const charactersRootPath = path.join(rootPath, "characters");

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

  return toLibraryData(rootPath, indexState);
}

export function resolveImageFilePath(relativePath: string): string | null {
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
}
