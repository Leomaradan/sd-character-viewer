import path from "node:path";

import { ensureLocalEnvLoaded } from "@/lib/env";
import { SD_EXTRA_IMAGES_ROOT_ENV_KEY, SD_IMAGES_ROOT_ENV_KEY } from "@/lib/env-keys";
import {
  buildExtraRootRelativePrefix,
  EXTRA_ROOT_PATH_SEGMENT,
  resolveExtraImageRoots,
} from "@/lib/extra-image-roots";
import { type TMediaType } from "@/types/library";

const PNG_EXTENSION = ".png";
const VIDEO_EXTENSION = ".mp4";
export const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([PNG_EXTENSION, VIDEO_EXTENSION]);
const PREVIEW_FILE_SUFFIX = ".preview.jpg";
// Video previews use a distinct suffix/extension from image previews: the running app never
// generates them itself (no ffmpeg invoked at request time), only the offline sync script
// (via ffmpeg) or an operator can provide one.
const VIDEO_PREVIEW_FILE_SUFFIX = ".preview.png";

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

export const getImagesRootPathFromEnv = (): string | null => {
  ensureLocalEnvLoaded();
  const configuredRoot = process.env[SD_IMAGES_ROOT_ENV_KEY]?.trim();
  return configuredRoot || null;
};

export const isVideoFilePath = (filePath: string): boolean => {
  return path.extname(filePath).toLowerCase() === VIDEO_EXTENSION;
};

export const getMediaTypeForFileName = (fileName: string): TMediaType => {
  return isVideoFilePath(fileName) ? "video" : "image";
};

// A video's own preview sidecar (e.g. "Base.preview.png") ends in ".png", so it must be excluded
// explicitly once ".png" is treated as a generic media extension, or it would be misindexed as a
// standalone image alongside the video it belongs to.
export const isPreviewSidecarFileName = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return lower.endsWith(PREVIEW_FILE_SUFFIX) || lower.endsWith(VIDEO_PREVIEW_FILE_SUFFIX);
};

// The duplicate-finder's two-phase rename (see /api/duplicates) briefly leaves a file under this
// prefix while renumbering survivors. It must never be indexed as a real image - a concurrent
// library read racing that rename would otherwise pick it up mid-move.
export const TEMPORARY_RENAME_FILE_PREFIX = ".duplicate-finder-tmp-";

export const isTemporaryRenameFileName = (fileName: string): boolean =>
  fileName.startsWith(TEMPORARY_RENAME_FILE_PREFIX);

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
