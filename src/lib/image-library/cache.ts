import { promises as fs } from "node:fs";
import path from "node:path";

import { ensureLocalEnvLoaded } from "@/lib/env";
import { SD_CACHE_DIR_ENV_KEY, SD_LIBRARY_CACHE_TTL_SECONDS_ENV_KEY } from "@/lib/env-keys";
import { type IImageItem, type ILibraryData } from "@/types/library";

import { TO_ANIMATE_FILE_NAME, TO_EXTEND_FILE_NAME, withMarkedImageFileLock } from "./marks";
import { getImagesRootPathFromEnv, parseExtraRootRelativePath } from "./paths";
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
const LIBRARY_INDEX_CACHE_VERSION = 11;
const NEW_IMAGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_LIBRARY_CACHE_TTL_SECONDS = 120;

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

export interface ILibraryIndexSnapshot {
  configFiles: ICacheFileSnapshot[];
  directories: ICacheFileSnapshot[];
  extraDirectories: ICacheFileSnapshot[];
}

// The last library read or built, kept in memory so a request doesn't have to re-read and parse
// the (multi-MB) index cache file, nor walk every character directory: within the TTL only the
// config files and the index cache file itself are stat()ed. `cacheFileModifiedAt` ties it to the
// file on disk, so deleting or rewriting that file (removeLibraryIndexCache, another process)
// drops it too.
interface ILibraryMemoryCache {
  cachePath: string;
  extraRootPaths: string[];
  cacheFileModifiedAt: number;
  snapshot: ILibraryIndexSnapshot;
  library: ILibraryData;
  checkedAt: number;
}

interface ILibraryCacheState {
  memory: ILibraryMemoryCache | null;
  // Bumped by removeLibraryIndexCache, so a rebuild that started before an in-app change doesn't
  // store its (possibly stale) result.
  generation: number;
}

// On globalThis rather than module scope: Next.js can load this module once per route bundle, and
// every API route must share one cache.
const LIBRARY_CACHE_STATE_KEY = Symbol.for("sd-character-viewer.library-cache");
const getLibraryCacheState = (): ILibraryCacheState => {
  const globalState = globalThis as typeof globalThis & {
    [LIBRARY_CACHE_STATE_KEY]?: ILibraryCacheState;
  };
  globalState[LIBRARY_CACHE_STATE_KEY] ??= { memory: null, generation: 0 };
  return globalState[LIBRARY_CACHE_STATE_KEY];
};

export const getLibraryCacheGeneration = (): number => getLibraryCacheState().generation;

// How long a library kept in memory is trusted before every character directory is stat()ed
// again to pick up files added/removed outside the app. 0 checks on every request.
const getLibraryCacheTtlMs = (): number => {
  ensureLocalEnvLoaded();
  const rawValue = process.env[SD_LIBRARY_CACHE_TTL_SECONDS_ENV_KEY]?.trim();
  const seconds = rawValue ? Number(rawValue) : Number.NaN;
  return (
    (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_LIBRARY_CACHE_TTL_SECONDS) * 1000
  );
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

export const collectConfigFileSnapshots = async (
  rootPath: string,
): Promise<ICacheFileSnapshot[]> => {
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
  };
};

const collectDirectoryTreeSnapshots = async (
  rootPath: string,
  charactersRootPath: string,
  extraRootPaths: string[],
): Promise<Omit<ILibraryIndexSnapshot, "configFiles">> => {
  const [directories, extraDirectories] = await Promise.all([
    collectDirectorySnapshots(rootPath, charactersRootPath),
    collectExtraDirectorySnapshots(extraRootPaths),
  ]);
  return { directories, extraDirectories };
};

const getFileModifiedAt = async (filePath: string): Promise<number | null> => {
  const stat = await fs.stat(filePath).catch(() => null);
  return stat?.isFile() ? stat.mtimeMs : null;
};

const rememberLibrary = async (
  cachePath: string,
  extraRootPaths: string[],
  snapshot: ILibraryIndexSnapshot,
  library: ILibraryData,
  checkedAt: number,
): Promise<void> => {
  const cacheFileModifiedAt = await getFileModifiedAt(cachePath);
  const state = getLibraryCacheState();
  state.memory =
    cacheFileModifiedAt === null
      ? null
      : {
          cachePath,
          extraRootPaths,
          cacheFileModifiedAt,
          snapshot,
          library,
          checkedAt,
        };
};

// Answers from the in-memory library when it still matches this root and the index cache file:
// a hit, or `null` (rebuild needed) when a config file or - once the TTL has run out - a
// directory changed. `undefined` means there's nothing usable in memory, so the disk cache file
// decides.
const readLibraryMemoryCache = async (
  rootPath: string,
  charactersRootPath: string,
  extraRootPaths: string[],
  cachePath: string,
): Promise<ILibraryData | null | undefined> => {
  const { memory } = getLibraryCacheState();
  if (
    memory?.cachePath !== cachePath ||
    !areStringArraysEqual(memory.extraRootPaths, extraRootPaths) ||
    (await getFileModifiedAt(cachePath)) !== memory.cacheFileModifiedAt
  ) {
    return undefined;
  }

  const configFiles = await collectConfigFileSnapshots(rootPath);
  if (!areSnapshotsEqual(configFiles, memory.snapshot.configFiles)) {
    return null;
  }

  if (Date.now() - memory.checkedAt >= getLibraryCacheTtlMs()) {
    const { directories, extraDirectories } = await collectDirectoryTreeSnapshots(
      rootPath,
      charactersRootPath,
      extraRootPaths,
    );
    if (
      !areSnapshotsEqual(directories, memory.snapshot.directories) ||
      !areSnapshotsEqual(extraDirectories, memory.snapshot.extraDirectories)
    ) {
      return null;
    }
    memory.checkedAt = Date.now();
  }

  return refreshCachedLibrary(memory.library);
};

export const readLibraryIndexCache = async (
  rootPath: string,
  charactersRootPath: string,
  extraRootPaths: string[],
): Promise<ILibraryData | null> => {
  const cachePath = getLibraryIndexCachePath(rootPath);

  try {
    const memoryResult = await readLibraryMemoryCache(
      rootPath,
      charactersRootPath,
      extraRootPaths,
      cachePath,
    );
    if (memoryResult !== undefined) {
      return memoryResult;
    }

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

    const [configFiles, { directories, extraDirectories }] = await Promise.all([
      collectConfigFileSnapshots(rootPath),
      collectDirectoryTreeSnapshots(rootPath, charactersRootPath, extraRootPaths),
    ]);

    if (
      !areSnapshotsEqual(configFiles, cacheFile.configFiles) ||
      !areSnapshotsEqual(directories, cacheFile.directories) ||
      !areSnapshotsEqual(extraDirectories, cacheFile.extraDirectories ?? [])
    ) {
      return null;
    }

    await rememberLibrary(
      cachePath,
      extraRootPaths,
      { configFiles, directories, extraDirectories },
      cacheFile.library,
      Date.now(),
    );
    return refreshCachedLibrary(cacheFile.library);
  } catch {
    return null;
  }
};

// Writes the index cache file for `library` with `snapshot` and keeps it in memory. The snapshot's
// config files must be taken *before* the library read them: a config edit landing while it's
// built then still shows as a change on the next read, instead of being recorded as current. `generation` is getLibraryCacheGeneration() from
// before the library was built: when an in-app change happened since, the result may predate it,
// so it's neither written nor kept in memory (the next read rebuilds). `checkedAt` is when every
// directory was last checked (a partial refresh passes the previous time, so the TTL check of
// the folders it didn't touch isn't postponed).
export const storeLibraryIndexCache = async (
  rootPath: string,
  extraRootPaths: string[],
  library: ILibraryData,
  { configFiles, directories, extraDirectories }: ILibraryIndexSnapshot,
  generation: number,
  checkedAt: number = Date.now(),
): Promise<boolean> => {
  const cachePath = getLibraryIndexCachePath(rootPath);

  if (generation !== getLibraryCacheGeneration()) {
    return true;
  }

  try {
    const cacheFile: ILibraryIndexCacheFile = {
      version: LIBRARY_INDEX_CACHE_VERSION,
      rootPath: path.resolve(rootPath),
      generatedAt: Date.now(),
      configFiles,
      directories,
      extraRootPaths,
      extraDirectories,
      // Persist the caller's actual cacheAvailable (it already reflects whether the first-seen
      // sync succeeded) rather than forcing true - otherwise a future cache hit would report the
      // cache as available even though first-seen persistence is still broken.
      library,
    };

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    // Compact JSON: it's only ever read back by this module, and is a few MB for a big library.
    await fs.writeFile(cachePath, JSON.stringify(cacheFile), "utf8");
    // An in-app change landed while the snapshots were taken or the file written: its own unlink
    // may have run before this write, so drop the file here (the next read rebuilds).
    if (generation !== getLibraryCacheGeneration()) {
      await fs.unlink(cachePath).catch(() => {});
      return true;
    }
    await rememberLibrary(
      cachePath,
      extraRootPaths,
      { configFiles, directories, extraDirectories },
      library,
      checkedAt,
    );
    return true;
  } catch {
    return false;
  }
};

export const writeLibraryIndexCache = async (
  rootPath: string,
  charactersRootPath: string,
  extraRootPaths: string[],
  library: ILibraryData,
  configFiles: ICacheFileSnapshot[],
  generation: number,
): Promise<boolean> => {
  if (generation !== getLibraryCacheGeneration()) {
    return true;
  }

  try {
    const directorySnapshots = await collectDirectoryTreeSnapshots(
      rootPath,
      charactersRootPath,
      extraRootPaths,
    );
    return await storeLibraryIndexCache(
      rootPath,
      extraRootPaths,
      library,
      { configFiles, ...directorySnapshots },
      generation,
    );
  } catch {
    return false;
  }
};

// For an in-app change (see refreshLibraryAfterChange): stops in-flight full builds from being
// stored, like removeLibraryIndexCache, but keeps the library in memory to be patched.
export const bumpLibraryCacheGeneration = (): number => {
  const state = getLibraryCacheState();
  state.generation += 1;
  return state.generation;
};

// The library kept in memory for this root and its snapshot, when it still matches the index
// cache file and the config files on disk; null when it can't be patched (full rebuild needed).
export const getRememberedLibrary = async (
  rootPath: string,
  extraRootPaths: string[],
): Promise<{
  library: ILibraryData;
  snapshot: ILibraryIndexSnapshot;
  checkedAt: number;
} | null> => {
  const cachePath = getLibraryIndexCachePath(rootPath);
  const { memory } = getLibraryCacheState();

  if (
    memory?.cachePath !== cachePath ||
    !areStringArraysEqual(memory.extraRootPaths, extraRootPaths) ||
    (await getFileModifiedAt(cachePath)) !== memory.cacheFileModifiedAt ||
    !areSnapshotsEqual(await collectConfigFileSnapshots(rootPath), memory.snapshot.configFiles)
  ) {
    return null;
  }

  return { library: memory.library, snapshot: memory.snapshot, checkedAt: memory.checkedAt };
};

// Returns `snapshot` with one character folder's mtime replaced. `folderRelativePath` is in
// library form ("characters/3d/Anna" or "extra-roots/00/characters/3d/Anna"). Null when the
// folder isn't in the snapshot (a new or removed folder needs a full rebuild).
export const withDirectorySnapshot = (
  snapshot: ILibraryIndexSnapshot,
  folderRelativePath: string,
  modifiedAt: number,
): ILibraryIndexSnapshot | null => {
  const extraRoot = parseExtraRootRelativePath(folderRelativePath);
  const key = extraRoot ? `${extraRoot.extraRootIndex}/${extraRoot.remainder}` : folderRelativePath;
  const list = extraRoot ? snapshot.extraDirectories : snapshot.directories;
  if (!list.some((entry) => entry.relativePath === key)) {
    return null;
  }

  const updated = list.map((entry) =>
    entry.relativePath === key ? { relativePath: key, modifiedAt: Math.trunc(modifiedAt) } : entry,
  );
  return extraRoot
    ? { ...snapshot, extraDirectories: updated }
    : { ...snapshot, directories: updated };
};

export const removeLibraryIndexCache = async (): Promise<void> => {
  const state = getLibraryCacheState();
  state.memory = null;
  state.generation += 1;

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

// Called after a manual rename, so the renamed file keeps its discovery date (and "new"/seen
// state) instead of being re-discovered as new under its new path on the next rebuild. Same
// locked read-modify-write as removeFirstSeenCacheEntry above.
export const migrateFirstSeenCacheEntry = async (
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  const normalizedOldPath = normalizeRelativePath(oldRelativePath);
  const normalizedNewPath = normalizeRelativePath(newRelativePath);

  await withMarkedImageFileLock(getFirstSeenCachePath(rootPath), async () => {
    const { cache: firstSeenCache } = await loadFirstSeenCache(rootPath);
    const firstSeenAt = firstSeenCache.get(normalizedOldPath);

    if (firstSeenAt === undefined) {
      return;
    }

    firstSeenCache.delete(normalizedOldPath);
    firstSeenCache.set(normalizedNewPath, firstSeenAt);
    await persistFirstSeenCache(rootPath, firstSeenCache);
  });
};

// Called when an image/video's Details view is opened, so it drops out of `isNew` (and the "show
// new only" filter) immediately rather than waiting out NEW_IMAGE_WINDOW_MS. Sets firstSeenAt to
// 0 rather than deleting the cache entry - a delete would re-seed it at "now" on the next
// uncached rebuild (markNewImages treats a missing entry as freshly discovered), making the image
// look new again instead of seen. Returns whether anything changed: the caller then refreshes the
// library index (refreshLibraryAfterChange), since a cache hit recomputes `isNew` from the
// *cached* image's firstSeenAt (see refreshCachedLibrary) rather than re-reading this file.
export const markImageAsSeen = async (relativePath: string): Promise<boolean> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return false;
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

  return didChange;
};
