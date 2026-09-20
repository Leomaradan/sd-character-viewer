#!/usr/bin/env node

import nextEnv from "@next/env";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import sharp from "sharp";

import {
  buildExtraRootRelativePrefix,
  resolveExtraImageRoots,
} from "../src/lib/extra-image-roots.js";

const { loadEnvConfig } = nextEnv;

const execFileAsync = promisify(execFile);

const PNG_EXTENSION = ".png";
const VIDEO_EXTENSION = ".mp4";
const MEDIA_EXTENSIONS = new Set([PNG_EXTENSION, VIDEO_EXTENSION]);
const DEFAULT_CACHE_DIR_RELATIVE_PATH = path.join(".cache", "sd-character-viewer");
const FIRST_SEEN_CACHE_FILE_SUFFIX = ".first-seen.json";
const LIBRARY_INDEX_CACHE_FILE_SUFFIX = ".library-index.json";
const LIBRARY_INDEX_CACHE_VERSION = 1;
const PREVIEW_FILE_SUFFIX = ".preview.jpg";
// Video previews use a distinct suffix/extension from image previews (a poster frame extracted
// via ffmpeg, saved as PNG rather than JPEG); the suffix still needs excluding from the
// media-file walk below so a video's own ".preview.png" sidecar isn't misindexed as a standalone
// image.
const VIDEO_PREVIEW_FILE_SUFFIX = ".preview.png";
// Seek target, in seconds, for the extracted poster frame. (ffmpeg exits non-zero if asked to seek past the end of the stream).
const VIDEO_PREVIEW_SEEK_SECONDS = 0;
const PREVIEW_GENERATION_CONCURRENCY = 4;
const DEFAULT_STYLES = ["realistic", "3d", "anime"];
const DEFAULT_STYLE = "3d";
const DEFAULT_POSE_PATTERN_FILTER_CONFIGS = [{ label: "With Somebody", pattern: "^With " }];

const normalizeRelativePath = (filePath) => {
  return filePath.split(path.sep).join(path.posix.sep);
};

const compareNatural = (a, b) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

const ucFirst = (value) => {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const sanitizePoseName = (rawPoseName) => {
  return rawPoseName.replace(/[_-]+/g, " ").trim();
};

const parsePoseName = (fileName) => {
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

const normalizeCharacterNameKey = (characterName) => {
  return characterName.trim().toLowerCase();
};

const normalizeMetadataTags = (tags) => {
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
    return [];
  }

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))].sort(
    compareNatural,
  );
};

const normalizeStyleNames = (styles) => {
  if (!Array.isArray(styles)) {
    return [];
  }

  const normalizedStyles = styles
    .filter((style) => typeof style === "string")
    .map((style) => style.trim())
    .filter((style) => style !== "");

  return [...new Set(normalizedStyles)];
};

const resolveDefaultStyle = (styles, rawDefaultStyle) => {
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

const normalizeStyleLabels = (styles, styleLabels) => {
  if (!styleLabels || typeof styleLabels !== "object" || Array.isArray(styleLabels)) {
    return {};
  }

  const styleSet = new Set(styles);
  const normalizedLabels = {};

  for (const [style, label] of Object.entries(styleLabels)) {
    if (!styleSet.has(style) || typeof label !== "string") {
      continue;
    }

    const normalizedLabel = label.trim();
    if (normalizedLabel) {
      normalizedLabels[style] = normalizedLabel;
    }
  }

  return normalizedLabels;
};

const readStyleConfig = async (rootPath) => {
  const fallback = { styles: DEFAULT_STYLES, defaultStyle: DEFAULT_STYLE, styleLabels: {} };

  try {
    const parsedContent = JSON.parse(await fs.readFile(path.join(rootPath, "config.json"), "utf8"));
    if (!parsedContent || typeof parsedContent !== "object" || Array.isArray(parsedContent)) {
      return fallback;
    }

    const styles = normalizeStyleNames(parsedContent.styles);
    if (styles.length === 0) {
      return fallback;
    }

    return {
      styles,
      defaultStyle: resolveDefaultStyle(styles, parsedContent.defaultStyle),
      styleLabels: normalizeStyleLabels(styles, parsedContent.styleLabels),
    };
  } catch {
    return fallback;
  }
};

const createPosePatternFilterId = (label, pattern, flags) => {
  const rawKey = `${label}\u0000${pattern}\u0000${flags}`;
  return `pose-pattern::${Buffer.from(rawKey).toString("base64url")}`;
};

const normalizePosePatternFilters = (filterConfigs) => {
  const uniqueFilters = new Map();

  for (const filterConfig of filterConfigs) {
    if (!filterConfig || typeof filterConfig !== "object" || Array.isArray(filterConfig)) {
      continue;
    }

    if (typeof filterConfig.label !== "string" || typeof filterConfig.pattern !== "string") {
      continue;
    }

    const label = filterConfig.label.trim();
    const pattern = filterConfig.pattern;
    const flags = typeof filterConfig.flags === "string" ? filterConfig.flags.trim() : "";

    if (!label || pattern.trim() === "") {
      continue;
    }

    try {
      new RegExp(pattern, flags);
    } catch {
      continue;
    }

    const id = createPosePatternFilterId(label, pattern, flags);
    uniqueFilters.set(id, { id, label, pattern, flags: flags || undefined });
  }

  return [...uniqueFilters.values()];
};

const readPosePatternFilters = async (rootPath) => {
  try {
    const parsedContent = JSON.parse(
      await fs.readFile(path.join(rootPath, "pose-filters.json"), "utf8"),
    );
    const items = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
    const filters = normalizePosePatternFilters(items);
    return filters.length > 0
      ? filters
      : normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS);
  } catch {
    return normalizePosePatternFilters(DEFAULT_POSE_PATTERN_FILTER_CONFIGS);
  }
};

const readCharactersMetadata = async (rootPath) => {
  const metadataByCharacter = new Map();

  try {
    const parsedContent = JSON.parse(
      await fs.readFile(path.join(rootPath, "characters", "characters.json"), "utf8"),
    );
    const items = Array.isArray(parsedContent) ? parsedContent : [parsedContent];

    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      if (typeof item.name !== "string" || typeof item.category !== "string") {
        continue;
      }

      const normalizedName = normalizeCharacterNameKey(item.name);
      if (!normalizedName) {
        continue;
      }

      metadataByCharacter.set(normalizedName, {
        category: item.category,
        serie: typeof item.serie === "string" ? item.serie : null,
        tags: normalizeMetadataTags(item.tags),
      });
    }
  } catch {
    return new Map();
  }

  return metadataByCharacter;
};

const toCacheFileNameForRoot = (rootPath, suffix) => {
  const rootHash = Buffer.from(path.resolve(rootPath)).toString("base64url");
  return `${rootHash}${suffix}`;
};

const getCacheDirectoryPath = () => {
  const configuredCacheDir = process.env.SD_CACHE_DIR?.trim();

  if (configuredCacheDir) {
    return path.resolve(configuredCacheDir);
  }

  return path.resolve(process.cwd(), DEFAULT_CACHE_DIR_RELATIVE_PATH);
};

const getFirstSeenCachePath = (rootPath) => {
  return path.join(
    getCacheDirectoryPath(),
    toCacheFileNameForRoot(rootPath, FIRST_SEEN_CACHE_FILE_SUFFIX),
  );
};

const getLibraryIndexCachePath = (rootPath) => {
  return path.join(
    getCacheDirectoryPath(),
    toCacheFileNameForRoot(rootPath, LIBRARY_INDEX_CACHE_FILE_SUFFIX),
  );
};

const resolveCreationTimestampMs = (fileStat) => {
  const times = [];

  [fileStat.birthtimeMs, fileStat.atimeMs, fileStat.mtimeMs, fileStat.ctimeMs].forEach((time) => {
    if (Number.isFinite(time) && time > 0) {
      times.push(Math.trunc(time));
    }
  });

  if (times.length === 0) {
    const fallback =
      Number.isFinite(fileStat.mtimeMs) && fileStat.mtimeMs > 0 ? fileStat.mtimeMs : Date.now();
    return Math.trunc(fallback);
  }

  return Math.trunc(Math.min(...times));
};

const isPreviewSidecarFileName = (fileName) => {
  const lower = fileName.toLowerCase();
  return lower.endsWith(PREVIEW_FILE_SUFFIX) || lower.endsWith(VIDEO_PREVIEW_FILE_SUFFIX);
};

const collectMediaFiles = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const mediaFilePaths = [];

  const childMediaFileLists = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => collectMediaFiles(path.join(directoryPath, entry.name))),
  );
  for (const childMediaFilePaths of childMediaFileLists) {
    mediaFilePaths.push(...childMediaFilePaths);
  }

  for (const entry of entries) {
    if (entry.isDirectory() || !entry.isFile()) {
      continue;
    }

    if (isPreviewSidecarFileName(entry.name)) {
      continue;
    }

    if (!MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    mediaFilePaths.push(path.join(directoryPath, entry.name));
  }

  return mediaFilePaths;
};

const buildFirstSeenMapFromFilesystem = async (rootPath, mediaFilePaths) => {
  const firstSeenByRelativePath = new Map();

  const eligiblePaths = mediaFilePaths.filter((absoluteMediaFilePath) => {
    const relativeToRoot = path.relative(rootPath, absoluteMediaFilePath);
    return !relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot);
  });
  const stats = await Promise.all(
    eligiblePaths.map((absoluteMediaFilePath) => fs.stat(absoluteMediaFilePath)),
  );

  for (const [index, absoluteMediaFilePath] of eligiblePaths.entries()) {
    const relativeToRoot = path.relative(rootPath, absoluteMediaFilePath);
    const firstSeenAt = resolveCreationTimestampMs(stats[index]);
    const cacheKey = normalizeRelativePath(relativeToRoot);
    firstSeenByRelativePath.set(cacheKey, firstSeenAt);
  }

  return firstSeenByRelativePath;
};

// Mirrors how src/lib/image-library.ts merges extra-root images into the same first-seen cache
// as the main root: each extra root's relative paths get an "extra-roots/{index}/" prefix so
// they can't collide with the main root or with each other, and a root that's missing/unreadable
// at scan time is skipped rather than failing the whole run.
const collectExtraRootMediaAndFirstSeen = async (extraRootPaths) => {
  const mediaFilePaths = [];
  const firstSeenByRelativePath = new Map();

  // Each extra root is scanned independently (own directory tree, own try/catch so one
  // missing/unreadable root doesn't fail the others), so the scans run concurrently; only the
  // synchronous merge into the shared map/array below happens in a fixed, deterministic order.
  const extraRootResults = await Promise.all(
    extraRootPaths.map(async (extraRootPath, extraRootIndex) => {
      const extraCharactersRootPath = path.join(extraRootPath, "characters");

      try {
        const extraMediaFilePaths = await collectMediaFiles(extraCharactersRootPath);
        const extraFirstSeen = await buildFirstSeenMapFromFilesystem(
          extraRootPath,
          extraMediaFilePaths,
        );
        return { extraRootIndex, extraMediaFilePaths, extraFirstSeen };
      } catch (error) {
        console.warn(
          `Skipping extra image root ${extraRootPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    }),
  );

  for (const result of extraRootResults) {
    if (!result) {
      continue;
    }

    const { extraRootIndex, extraMediaFilePaths, extraFirstSeen } = result;
    const prefix = buildExtraRootRelativePrefix(extraRootIndex);

    for (const [relativePath, firstSeenAt] of extraFirstSeen) {
      firstSeenByRelativePath.set(normalizeRelativePath(`${prefix}/${relativePath}`), firstSeenAt);
    }

    mediaFilePaths.push(...extraMediaFilePaths);
  }

  return { mediaFilePaths, firstSeenByRelativePath };
};

const getFileSnapshot = async (rootPath, absolutePath) => {
  const stat = await fs.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }

  return {
    relativePath: normalizeRelativePath(path.relative(rootPath, absolutePath)),
    modifiedAt: Math.trunc(stat.mtimeMs),
  };
};

const collectConfigFileSnapshots = async (rootPath) => {
  const configPaths = [
    path.join(rootPath, "config.json"),
    path.join(rootPath, "pose-filters.json"),
    path.join(rootPath, "characters", "characters.json"),
  ];
  const snapshots = await Promise.all(
    configPaths.map((configPath) => getFileSnapshot(rootPath, configPath)),
  );
  return snapshots.filter(Boolean);
};

const collectDirectorySnapshots = async (rootPath, directoryPath) => {
  const directoryStat = await fs.stat(directoryPath);
  const snapshots = [
    {
      relativePath: normalizeRelativePath(path.relative(rootPath, directoryPath)),
      modifiedAt: Math.trunc(directoryStat.mtimeMs),
    },
  ];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  const childSnapshotLists = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => collectDirectorySnapshots(rootPath, path.join(directoryPath, entry.name))),
  );
  for (const childSnapshots of childSnapshotLists) {
    snapshots.push(...childSnapshots);
  }

  return snapshots.sort((a, b) => compareNatural(a.relativePath, b.relativePath));
};

const toMetadataFilterIds = (character) => {
  const filterIds = [];

  if (character.category?.trim()) {
    filterIds.push(`category::${character.category}`);
  }
  if (character.serie?.trim()) {
    filterIds.push(`serie::${character.serie}`);
  }
  for (const tag of character.tags) {
    if (tag.trim()) {
      filterIds.push(`tag::${tag}`);
    }
  }

  return filterIds;
};

const buildMetadataFilterOptions = (characters) => {
  const categories = new Set(
    characters.map((character) => character.category).filter((value) => value?.trim()),
  );
  const series = new Set(
    characters.map((character) => character.serie).filter((value) => value?.trim()),
  );
  const tags = new Set(
    characters.flatMap((character) => character.tags).filter((value) => value?.trim()),
  );

  return [
    ...[...categories].map((category) => ({
      id: `category::${category}`,
      type: "category",
      value: category,
      label: category,
    })),
    ...[...series].map((serie) => ({
      id: `serie::${serie}`,
      type: "serie",
      value: serie,
      label: serie,
    })),
    ...[...tags].map((tag) => ({
      id: `tag::${tag}`,
      type: "tag",
      value: tag,
      label: ucFirst(tag),
    })),
  ].sort((a, b) => compareNatural(a.label, b.label));
};

// Parses one discovered media file into an ILibraryData image entry, or returns null when the
// path doesn't match the expected "characters/{style}/{character}/{file}" shape (e.g. it lives
// directly under an unrecognized style folder).
const buildImageEntryFromMediaFile = (params) => {
  const {
    rootPath,
    styleSet,
    compiledPatternFilters,
    firstSeenByRelativePath,
    absoluteMediaFilePath,
    mtimeMs,
  } = params;
  const relativePath = normalizeRelativePath(path.relative(rootPath, absoluteMediaFilePath));
  const parts = relativePath.split("/");
  if (parts.length < 4 || parts[0] !== "characters" || !styleSet.has(parts[1])) {
    return null;
  }

  const [, style, characterName, ...fileNameParts] = parts;
  const mediaFileName = fileNameParts.join("/");
  if (mediaFileName.includes("/")) {
    return null;
  }

  const parsedPose = parsePoseName(mediaFileName);
  const posePatternFilterIds = compiledPatternFilters
    .filter((filter) => {
      filter.regex.lastIndex = 0;
      return filter.regex.test(parsedPose.poseBaseName);
    })
    .map((filter) => filter.id);
  const mediaType =
    path.extname(mediaFileName).toLowerCase() === VIDEO_EXTENSION ? "video" : "image";

  return {
    id: `${style}::${characterName}::${mediaFileName}`,
    style,
    characterName,
    poseName: parsedPose.poseName,
    poseBaseName: parsedPose.poseBaseName,
    poseVariant: parsedPose.poseVariant,
    relativePath,
    isNew: false,
    firstSeenAt: firstSeenByRelativePath.get(relativePath) ?? Date.now(),
    modifiedAt: Math.trunc(mtimeMs),
    posePatternFilterIds,
    mediaType,
  };
};

const updateCharacterAccumulator = (characterMap, image) => {
  const existingCharacter = characterMap.get(image.characterName) ?? {
    name: image.characterName,
    imageCount: 0,
    styles: new Set(),
    poses: new Set(),
    thumbnailsByStyle: {},
    thumbnailModifiedAtByStyle: {},
  };
  existingCharacter.imageCount += 1;
  existingCharacter.styles.add(image.style);
  existingCharacter.poses.add(image.poseBaseName);
  if (
    image.poseBaseName.toLowerCase() === "base" &&
    !existingCharacter.thumbnailsByStyle[image.style]
  ) {
    existingCharacter.thumbnailsByStyle[image.style] = image.relativePath;
    existingCharacter.thumbnailModifiedAtByStyle[image.style] = image.modifiedAt;
  }
  characterMap.set(image.characterName, existingCharacter);
};

const buildLibraryIndexCache = async (
  rootPath,
  charactersRootPath,
  mediaFilePaths,
  firstSeenByRelativePath,
) => {
  const [styleConfig, posePatternFilters, metadataByCharacter] = await Promise.all([
    readStyleConfig(rootPath),
    readPosePatternFilters(rootPath),
    readCharactersMetadata(rootPath),
  ]);
  const styleSet = new Set(styleConfig.styles);
  const compiledPatternFilters = posePatternFilters.map((filter) => ({
    id: filter.id,
    regex: new RegExp(filter.pattern, filter.flags),
  }));
  const images = [];
  const characterMap = new Map();
  const poseCounter = new Map();

  const stats = await Promise.all(
    mediaFilePaths.map((absoluteMediaFilePath) => fs.stat(absoluteMediaFilePath)),
  );

  for (const [index, absoluteMediaFilePath] of mediaFilePaths.entries()) {
    const image = buildImageEntryFromMediaFile({
      rootPath,
      styleSet,
      compiledPatternFilters,
      firstSeenByRelativePath,
      absoluteMediaFilePath,
      mtimeMs: stats[index].mtimeMs,
    });

    if (!image) {
      continue;
    }

    images.push(image);
    poseCounter.set(image.poseBaseName, (poseCounter.get(image.poseBaseName) ?? 0) + 1);
    updateCharacterAccumulator(characterMap, image);
  }

  images.sort((a, b) => {
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

  const defaultStyle = styleConfig.styles.includes(styleConfig.defaultStyle)
    ? styleConfig.defaultStyle
    : resolveDefaultStyle(styleConfig.styles, styleConfig.defaultStyle);
  const firstSeenByCharacter = new Map();
  for (const image of images) {
    if (image.style !== defaultStyle) {
      continue;
    }
    const currentFirstSeen = firstSeenByCharacter.get(image.characterName);
    if (currentFirstSeen === undefined || image.firstSeenAt < currentFirstSeen) {
      firstSeenByCharacter.set(image.characterName, image.firstSeenAt);
    }
  }

  const characters = [...characterMap.values()]
    .map((character) => {
      const metadata = metadataByCharacter.get(normalizeCharacterNameKey(character.name));
      return {
        name: character.name,
        imageCount: character.imageCount,
        poseCount: character.poses.size,
        styles: [...character.styles].sort(compareNatural),
        thumbnailsByStyle: character.thumbnailsByStyle,
        thumbnailModifiedAtByStyle: character.thumbnailModifiedAtByStyle,
        category: metadata?.category ?? null,
        serie: metadata?.serie ?? null,
        tags: metadata?.tags ?? [],
        firstSeenAt: firstSeenByCharacter.get(character.name) ?? 0,
      };
    })
    .sort((a, b) => compareNatural(a.name, b.name));
  const poses = [...poseCounter.entries()]
    .map(([name, imageCount]) => ({ name, imageCount }))
    .sort((a, b) => compareNatural(a.name, b.name));
  const metadataFilterOptions = buildMetadataFilterOptions(characters);
  const characterMetadataFilterIdsByName = Object.fromEntries(
    characters.map((character) => [character.name, toMetadataFilterIds(character)]),
  );
  const poseFilterOptions = [
    ...poses.map((pose) => ({ value: pose.name, label: pose.name })),
    ...posePatternFilters.map((filter) => ({ value: filter.id, label: filter.label })),
  ];
  const now = Date.now();

  for (const image of images) {
    image.isNew = now - image.firstSeenAt <= 3 * 24 * 60 * 60 * 1000;
  }

  const library = {
    rootConfigured: true,
    rootPath,
    defaultStyle,
    styles: styleConfig.styles,
    styleLabels: styleConfig.styleLabels,
    images,
    characters,
    poses,
    posePatternFilters,
    poseFilterOptions,
    metadataFilterOptions,
    characterMetadataFilterIdsByName,
    warning: null,
    cacheAvailable: true,
  };

  return {
    version: LIBRARY_INDEX_CACHE_VERSION,
    rootPath,
    generatedAt: now,
    configFiles: await collectConfigFileSnapshots(rootPath),
    directories: await collectDirectorySnapshots(rootPath, charactersRootPath),
    library,
  };
};

const writeLibraryIndexCache = async (
  rootPath,
  charactersRootPath,
  mediaFilePaths,
  firstSeenByRelativePath,
  isDryRun,
) => {
  const cacheFilePath = getLibraryIndexCachePath(rootPath);

  if (isDryRun) {
    console.log(`[dry-run] Would update ${cacheFilePath} with a precomputed library index.`);
    return;
  }

  const cacheFile = await buildLibraryIndexCache(
    rootPath,
    charactersRootPath,
    mediaFilePaths,
    firstSeenByRelativePath,
  );
  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, `${JSON.stringify(cacheFile, null, 2)}\n`, "utf8");
  console.log(`Updated ${cacheFilePath} with a precomputed library index.`);
};

const isVideoFilePath = (mediaFilePath) => {
  return path.extname(mediaFilePath).toLowerCase() === VIDEO_EXTENSION;
};

const toPreviewFilePath = (mediaFilePath) => {
  const extension = path.extname(mediaFilePath);
  const suffix = isVideoFilePath(mediaFilePath) ? VIDEO_PREVIEW_FILE_SUFFIX : PREVIEW_FILE_SUFFIX;
  return `${mediaFilePath.slice(0, -extension.length)}${suffix}`;
};

const runFfmpegFrameExtraction = async (videoFilePath, previewFilePath, maxSize, seekSeconds) => {
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    String(seekSeconds),
    "-i",
    videoFilePath,
    "-frames:v",
    "1",
    "-vf",
    String.raw`scale=w=min(iw\,${maxSize}):h=min(ih\,${maxSize}):force_original_aspect_ratio=decrease`,
    previewFilePath,
  ]);
};

const generateVideoPreview = async (videoFilePath, previewFilePath, maxSize) => {
  try {
    await runFfmpegFrameExtraction(
      videoFilePath,
      previewFilePath,
      maxSize,
      VIDEO_PREVIEW_SEEK_SECONDS,
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "ffmpeg was not found on PATH. Install ffmpeg to generate video preview thumbnails.",
        { cause: error },
      );
    }

    throw error;
  }
};

const generatePreviewForFile = async (mediaFilePath) => {
  const previewFilePath = toPreviewFilePath(mediaFilePath);

  const [mediaStat, previewStat] = await Promise.all([
    fs.stat(mediaFilePath),
    fs.stat(previewFilePath).catch(() => null),
  ]);

  if (previewStat && previewStat.mtimeMs >= mediaStat.mtimeMs) {
    return false;
  }

  const maxSize = Math.max(
    1,
    Number.parseInt(process.env.SD_PREVIEW_MAX_DIMENSION ?? "640", 10) || 640,
  );

  if (isVideoFilePath(mediaFilePath)) {
    await generateVideoPreview(mediaFilePath, previewFilePath, maxSize);
    return true;
  }

  await sharp(mediaFilePath)
    .resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: Number(process.env.SD_PREVIEW_JPEG_QUALITY ?? "70"), mozjpeg: true })
    .toFile(previewFilePath);

  return true;
};

const runWithConcurrency = async (items, concurrency, worker) => {
  const results = [];
  let nextIndex = 0;

  const runNext = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      // Intentionally sequential within each worker lane - that's what bounds concurrency to
      // `concurrency` lanes. Collecting every item's promise into one Promise.all instead (the
      // rule's usual suggestion) would run the whole batch at once, exactly what this helper
      // exists to avoid (each item spawns a sharp/ffmpeg process for thumbnail generation).
      // oxlint-disable-next-line eslint/no-await-in-loop
      results[currentIndex] = await worker(items[currentIndex]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));

  return results;
};

const generatePreviewThumbnails = async (mediaFilePaths, isDryRun) => {
  if (isDryRun) {
    const staleFlags = await Promise.all(
      mediaFilePaths.map(async (mediaFilePath) => {
        const previewFilePath = toPreviewFilePath(mediaFilePath);
        const [mediaStat, previewStat] = await Promise.all([
          fs.stat(mediaFilePath),
          fs.stat(previewFilePath).catch(() => null),
        ]);

        return !previewStat || previewStat.mtimeMs < mediaStat.mtimeMs;
      }),
    );
    const staleCount = staleFlags.filter(Boolean).length;

    console.log(`[dry-run] Would generate/update ${staleCount} preview thumbnail(s).`);
    return;
  }

  const results = await runWithConcurrency(
    mediaFilePaths,
    PREVIEW_GENERATION_CONCURRENCY,
    generatePreviewForFile,
  );
  const generatedCount = results.filter(Boolean).length;

  console.log(
    `Generated/updated ${generatedCount} preview thumbnail(s) (${mediaFilePaths.length - generatedCount} already up to date).`,
  );
};

const printUsage = () => {
  console.log("Usage: pnpm sync:first-seen:creation-dates [--dry-run] [--skip-thumbnails]");
};

const run = async () => {
  const args = new Set(process.argv.slice(2));
  const isDryRun = args.has("--dry-run");
  const skipThumbnails = args.has("--skip-thumbnails");

  if (args.has("--help") || args.has("-h")) {
    printUsage();
    return;
  }

  loadEnvConfig(process.cwd());

  const rootPath = process.env.SD_IMAGES_ROOT?.trim();
  if (!rootPath) {
    throw new Error("Missing SD_IMAGES_ROOT. Set it in your environment or .env.local.");
  }

  const resolvedRootPath = path.resolve(rootPath);
  const charactersRootPath = path.join(resolvedRootPath, "characters");

  const charactersRootStats = await fs.stat(charactersRootPath).catch(() => null);
  if (!charactersRootStats?.isDirectory()) {
    throw new Error(`Could not find a readable characters directory at ${charactersRootPath}`);
  }

  const mediaFilePaths = await collectMediaFiles(charactersRootPath);

  const firstSeenByRelativePath = await buildFirstSeenMapFromFilesystem(
    resolvedRootPath,
    mediaFilePaths,
  );

  const extraRootPaths = resolveExtraImageRoots(process.env.SD_EXTRA_IMAGES_ROOT);
  if (extraRootPaths.length > 0) {
    console.log(`Found ${extraRootPaths.length} extra image root(s).`);
  }

  const extraRootData = await collectExtraRootMediaAndFirstSeen(extraRootPaths);
  for (const [relativePath, firstSeenAt] of extraRootData.firstSeenByRelativePath) {
    firstSeenByRelativePath.set(relativePath, firstSeenAt);
  }

  const allMediaFilePaths = [...mediaFilePaths, ...extraRootData.mediaFilePaths];

  const sortedEntries = [...firstSeenByRelativePath.entries()].sort((a, b) =>
    compareNatural(a[0], b[0]),
  );
  const serializable = Object.fromEntries(sortedEntries);
  const cacheFilePath = getFirstSeenCachePath(resolvedRootPath);

  if (isDryRun) {
    console.log(
      `[dry-run] Would update ${cacheFilePath} with ${sortedEntries.length} image timestamps.`,
    );
  } else {
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    await fs.writeFile(cacheFilePath, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");

    console.log(`Updated ${cacheFilePath} with ${sortedEntries.length} image timestamps.`);
  }

  await writeLibraryIndexCache(
    resolvedRootPath,
    charactersRootPath,
    mediaFilePaths,
    firstSeenByRelativePath,
    isDryRun,
  );

  if (!skipThumbnails) {
    await generatePreviewThumbnails(allMediaFilePaths, isDryRun);
  }
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
