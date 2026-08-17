#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import sharp from "sharp";

const { loadEnvConfig } = nextEnv;

const PNG_EXTENSION = ".png";
const DEFAULT_CACHE_DIR_RELATIVE_PATH = path.join(".cache", "sd-character-viewer");
const FIRST_SEEN_CACHE_FILE_SUFFIX = ".first-seen.json";
const PREVIEW_FILE_SUFFIX = ".preview.jpg";
const PREVIEW_GENERATION_CONCURRENCY = 4;

const normalizeRelativePath = (filePath) => {
  return filePath.split(path.sep).join(path.posix.sep);
};

const compareNatural = (a, b) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

const toCacheFileNameForRoot = (rootPath) => {
  const rootHash = Buffer.from(path.resolve(rootPath)).toString("base64url");
  return `${rootHash}${FIRST_SEEN_CACHE_FILE_SUFFIX}`;
};

const getCacheDirectoryPath = () => {
  const configuredCacheDir = process.env.SD_CACHE_DIR?.trim();

  if (configuredCacheDir) {
    return path.resolve(configuredCacheDir);
  }

  return path.resolve(process.cwd(), DEFAULT_CACHE_DIR_RELATIVE_PATH);
};

const getFirstSeenCachePath = (rootPath) => {
  return path.join(getCacheDirectoryPath(), toCacheFileNameForRoot(rootPath));
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

const collectPngFiles = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const pngFilePaths = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      const childPngFilePaths = await collectPngFiles(entryPath);
      pngFilePaths.push(...childPngFilePaths);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (path.extname(entry.name).toLowerCase() !== PNG_EXTENSION) {
      continue;
    }

    pngFilePaths.push(entryPath);
  }

  return pngFilePaths;
};

const buildFirstSeenMapFromFilesystem = async (rootPath, pngFilePaths) => {
  const firstSeenByRelativePath = new Map();

  for (const absolutePngFilePath of pngFilePaths) {
    const relativeToRoot = path.relative(rootPath, absolutePngFilePath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      continue;
    }

    const stat = await fs.stat(absolutePngFilePath);
    const firstSeenAt = resolveCreationTimestampMs(stat);
    const cacheKey = normalizeRelativePath(relativeToRoot);
    firstSeenByRelativePath.set(cacheKey, firstSeenAt);
  }

  return firstSeenByRelativePath;
};

const toPreviewFilePath = (pngFilePath) => {
  const extension = path.extname(pngFilePath);
  return `${pngFilePath.slice(0, -extension.length)}${PREVIEW_FILE_SUFFIX}`;
};

const generatePreviewForFile = async (pngFilePath) => {
  const previewFilePath = toPreviewFilePath(pngFilePath);

  const [pngStat, previewStat] = await Promise.all([
    fs.stat(pngFilePath),
    fs.stat(previewFilePath).catch(() => null),
  ]);

  if (previewStat && previewStat.mtimeMs >= pngStat.mtimeMs) {
    return false;
  }

  const maxSize = Math.max(
    1,
    Number.parseInt(process.env.SD_PREVIEW_MAX_DIMENSION ?? "640", 10) || 640,
  );
  await sharp(pngFilePath)
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
      results[currentIndex] = await worker(items[currentIndex]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));

  return results;
};

const generatePreviewThumbnails = async (pngFilePaths, isDryRun) => {
  if (isDryRun) {
    let staleCount = 0;

    for (const pngFilePath of pngFilePaths) {
      const previewFilePath = toPreviewFilePath(pngFilePath);
      const [pngStat, previewStat] = await Promise.all([
        fs.stat(pngFilePath),
        fs.stat(previewFilePath).catch(() => null),
      ]);

      if (!previewStat || previewStat.mtimeMs < pngStat.mtimeMs) {
        staleCount += 1;
      }
    }

    console.log(`[dry-run] Would generate/update ${staleCount} preview thumbnail(s).`);
    return;
  }

  const results = await runWithConcurrency(
    pngFilePaths,
    PREVIEW_GENERATION_CONCURRENCY,
    generatePreviewForFile,
  );
  const generatedCount = results.filter(Boolean).length;

  console.log(
    `Generated/updated ${generatedCount} preview thumbnail(s) (${pngFilePaths.length - generatedCount} already up to date).`,
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

  const pngFilePaths = await collectPngFiles(charactersRootPath);

  const firstSeenByRelativePath = await buildFirstSeenMapFromFilesystem(
    resolvedRootPath,
    pngFilePaths,
  );
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

  if (!skipThumbnails) {
    await generatePreviewThumbnails(pngFilePaths, isDryRun);
  }
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
