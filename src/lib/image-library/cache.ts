import { promises as fs } from "node:fs";
import path from "node:path";

import { SD_CACHE_DIR_ENV_KEY } from "@/lib/env-keys";
import { type IImageItem, type ILibraryData } from "@/types/library";

import { TO_ANIMATE_FILE_NAME, TO_EXTEND_FILE_NAME, withMarkedImageFileLock } from "./marks";
import { getImagesRootPathFromEnv } from "./paths";
import { compareNatural, normalizeRelativePath } from "./shared";

export const LIBRARY_CONFIG_FILE_NAME = "config.json";
export const CHARACTERS_CONFIG_FILE_NAME = "characters.json";
export const POSE_FILTERS_FILE_NAME = "pose-filters.json";

const DEFAULT_CACHE_DIR_RELATIVE_PATH = path.join(".cache", "sd-character-viewer");
const FIRST_SEEN_CACHE_FILE_SUFFIX = ".first-seen.json";
const LIBRARY_INDEX_CACHE_FILE_SUFFIX = ".library-index.json";
// Bumped whenever a cached ILibraryData's shape changes, so a cache written by an older version
// of the app (e.g. one predating the `mediaType` field) is treated as a miss and rebuilt, rather
// than being returned as-is with the new field silently undefined.
const LIBRARY_INDEX_CACHE_VERSION = 7;
const NEW_IMAGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

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
    // Watched so that marking an image/video (which never touches the characters/ directory
    // tree the snapshots below watch) still invalidates the cache and gives
    // reconcilePendingAnimationMarks a chance to run - otherwise a mark added for a video that
    // already existed at the time of the last uncached rebuild would never be reconciled until
    // something unrelated happened to change a watched directory's mtime.
    path.join(rootPath, TO_ANIMATE_FILE_NAME),
    path.join(rootPath, TO_EXTEND_FILE_NAME),
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

export const readLibraryIndexCache = async (
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

export const writeLibraryIndexCache = async (
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

// Locked read-modify-write, same lock as removeFirstSeenCacheEntry/markImageAsSeen below: this
// file can be written concurrently by a "mark as seen" request or another in-flight rebuild, and
// without a lock the last writer's snapshot silently discards the others' changes.
export const syncFirstSeenCache = async (
  rootPath: string,
  imageItems: IImageItem[],
): Promise<{ available: boolean }> => {
  let cacheReadable = true;
  let cacheWritable = true;

  await withMarkedImageFileLock(getFirstSeenCachePath(rootPath), async () => {
    const loadedCache = await loadFirstSeenCache(rootPath);
    cacheReadable = loadedCache.available;

    const hasCacheChanges = markNewImages(imageItems, Date.now(), loadedCache.cache);
    if (hasCacheChanges) {
      cacheWritable = await persistFirstSeenCache(rootPath, loadedCache.cache);
    }
  });

  return { available: cacheReadable && cacheWritable };
};

export const removeFirstSeenCacheEntry = async (relativePath: string): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  const normalizedPath = normalizeRelativePath(relativePath);

  // Locked read-modify-write: this file is also touched by readImageLibrary()'s rebuild path and
  // by markImageAsSeen, and without a lock two concurrent writers (e.g. a rebuild in flight while
  // an image is deleted) can each read the same snapshot and the second write silently discards
  // the first one's change.
  await withMarkedImageFileLock(getFirstSeenCachePath(rootPath), async () => {
    const { cache: firstSeenCache } = await loadFirstSeenCache(rootPath);

    if (firstSeenCache.has(normalizedPath)) {
      firstSeenCache.delete(normalizedPath);
      await persistFirstSeenCache(rootPath, firstSeenCache);
    }
  });
};

// Called when an image/video's Details view is opened, so it drops out of `isNew` (and the "show
// new only" filter) immediately rather than waiting out NEW_IMAGE_WINDOW_MS. Sets firstSeenAt to
// 0 rather than deleting the cache entry - a delete would re-seed it at "now" on the next
// uncached rebuild (markNewImages treats a missing entry as freshly discovered), making the image
// look new again instead of seen. Also drops the library index cache: a cache hit recomputes
// `isNew` from the *cached* image's firstSeenAt (see refreshCachedLibrary) rather than re-reading
// this file, so without invalidating it the change wouldn't be visible until something else
// happened to trigger a rebuild.
export const markImageAsSeen = async (relativePath: string): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  const normalizedPath = normalizeRelativePath(relativePath);

  // Locked read-modify-write, same as removeFirstSeenCacheEntry above: without it, concurrent
  // "seen" requests (or one racing readImageLibrary()'s own rebuild) can each read the same
  // snapshot and the last write wins, silently erasing another image's just-persisted change.
  const didChange = await withMarkedImageFileLock(getFirstSeenCachePath(rootPath), async () => {
    const { cache: firstSeenCache } = await loadFirstSeenCache(rootPath);

    if (firstSeenCache.get(normalizedPath) === 0) {
      return false;
    }

    firstSeenCache.set(normalizedPath, 0);
    await persistFirstSeenCache(rootPath, firstSeenCache);
    return true;
  });

  if (didChange) {
    await removeLibraryIndexCache();
  }
};
