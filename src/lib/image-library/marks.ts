import { promises as fs } from "node:fs";
import path from "node:path";

import { type IAnimationGenerationOptions, type IVideoLink } from "@/types/library";

import { getImagesRootPathFromEnv } from "./paths";
import { isPlainObjectRecord, normalizeRelativePath } from "./shared";

// lora/trigger/weight are copied from the animation node the mark resolved to, and omitted
// entirely when that node doesn't set them.
export interface IToAnimateEntry extends IAnimationGenerationOptions {
  metadata: string;
  action: string;
  // Required in the type, but tolerated as missing on read (defaults to "") so pre-existing
  // to-animate.json/to-extends.json entries written before Edit Animation existed still parse.
  prompt: string;
}

// Same shape as IToAnimateEntry (a video-source mirror of it, for the Extend mark) - kept as a
// distinct name since the two are conceptually different marks even though the entry shape
// happens to match today.
export type IToExtendEntry = IToAnimateEntry;

const TO_UPSCALE_FILE_NAME = "to-upscale.json";
export const TO_ANIMATE_FILE_NAME = "to-animate.json";
export const TO_EXTEND_FILE_NAME = "to-extends.json";
const TO_UPSCALE_VIDEO_FILE_NAME = "to-upscale-video.json";
export const VIDEO_LINKS_FILE_NAME = "video-links.json";
const CUSTOM_POSES_FILE_NAME = "custom-poses.json";

// Accepts entries with no prompt field (or a malformed one) at parse time - normalizeToAnimateEntry
// below is what actually guarantees the IToAnimateEntry contract's prompt: string.
interface IRawToAnimateEntry {
  metadata: string;
  action: string;
  prompt?: unknown;
  lora?: unknown;
  trigger?: unknown;
  weight?: unknown;
}

const isToAnimateEntry = (value: unknown): value is IRawToAnimateEntry => {
  return (
    isPlainObjectRecord(value) &&
    typeof value.metadata === "string" &&
    typeof value.action === "string"
  );
};

// Always builds the entry in the same key order as buildToAnimateEntry, since
// removeMarkedImageMapEntryIfUnchanged compares entries by their JSON serialization.
const normalizeToAnimateEntry = (entry: IRawToAnimateEntry): IToAnimateEntry =>
  buildToAnimateEntry(
    entry.metadata,
    entry.action,
    typeof entry.prompt === "string" ? entry.prompt : "",
    {
      lora: typeof entry.lora === "string" ? entry.lora : undefined,
      trigger: typeof entry.trigger === "string" ? entry.trigger : undefined,
      weight: typeof entry.weight === "number" ? entry.weight : undefined,
    },
  );

const buildToAnimateEntry = (
  metadata: string,
  action: string,
  prompt: string,
  options: IAnimationGenerationOptions = {},
): IToAnimateEntry => {
  const entry: IToAnimateEntry = { metadata, action, prompt };
  if (options.lora !== undefined) {
    entry.lora = options.lora;
  }
  if (options.trigger !== undefined) {
    entry.trigger = options.trigger;
  }
  if (options.weight !== undefined) {
    entry.weight = options.weight;
  }
  return entry;
};

// `options` omitted (undefined) means "preserve whatever this mark already has" - same contract
// (and same in-lock atomicity reasoning) as setToAnimateEntry's `metadata`, used by Edit
// Animation, which only ever edits the prompt.
const resolveGenerationOptions = (
  options: IAnimationGenerationOptions | undefined,
  existingEntry: IRawToAnimateEntry | undefined,
): IAnimationGenerationOptions =>
  options ?? (existingEntry ? normalizeToAnimateEntry(existingEntry) : {});

const normalizeToAnimateEntries = (
  entries: Record<string, IRawToAnimateEntry>,
): Record<string, IToAnimateEntry> => {
  const normalizedEntries: Record<string, IToAnimateEntry> = {};
  for (const [relativePath, entry] of Object.entries(entries)) {
    normalizedEntries[relativePath] = normalizeToAnimateEntry(entry);
  }
  return normalizedEntries;
};

const isRawMetadataEntry = (value: unknown): value is string => typeof value === "string";

export const readMarkedImageMap = async <T>(
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

export const writeMarkedImageMap = async (
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

export const withMarkedImageFileLock = <T>(
  filePath: string,
  task: () => Promise<T>,
): Promise<T> => {
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
  const entries = await readMarkedImageMap(
    path.join(rootPath, TO_ANIMATE_FILE_NAME),
    isToAnimateEntry,
  );
  return normalizeToAnimateEntries(entries);
};

// `metadata` omitted (undefined) means "preserve whatever this mark already has" - used by Edit
// Animation, which only ever edits the prompt. Resolving that fallback here, inside the same
// lock as the read-modify-write, keeps it atomic: resolving it in the caller beforehand (reading
// the entry, then calling this with the resolved string) would race a concurrent mark update
// landing in between, silently reverting it once this write lands.
export const setToAnimateEntry = async (
  rootPath: string,
  relativePath: string,
  metadata: string | undefined,
  action: string,
  prompt: string,
  options?: IAnimationGenerationOptions,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_ANIMATE_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isToAnimateEntry);
    const resolvedMetadata = metadata ?? entries[relativePath]?.metadata ?? "";
    entries[relativePath] = buildToAnimateEntry(
      resolvedMetadata,
      action,
      prompt,
      resolveGenerationOptions(options, entries[relativePath]),
    );
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

export const readToUpscaleVideoEntries = async (
  rootPath: string,
): Promise<Record<string, string>> => {
  return readMarkedImageMap(path.join(rootPath, TO_UPSCALE_VIDEO_FILE_NAME), isRawMetadataEntry);
};

export const setToUpscaleVideoEntry = async (
  rootPath: string,
  relativePath: string,
  metadata: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_UPSCALE_VIDEO_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isRawMetadataEntry);
    entries[relativePath] = metadata;
    await writeMarkedImageMap(filePath, entries);
  });
};

export const removeToUpscaleVideoEntry = async (
  rootPath: string,
  relativePath: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_UPSCALE_VIDEO_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isRawMetadataEntry);
    if (relativePath in entries) {
      delete entries[relativePath];
      await writeMarkedImageMap(filePath, entries);
    }
  });
};

export const readToExtendEntries = async (
  rootPath: string,
): Promise<Record<string, IToExtendEntry>> => {
  const entries = await readMarkedImageMap(
    path.join(rootPath, TO_EXTEND_FILE_NAME),
    isToAnimateEntry,
  );
  return normalizeToAnimateEntries(entries);
};

export const setToExtendEntry = async (
  rootPath: string,
  relativePath: string,
  metadata: string,
  action: string,
  prompt: string,
  options?: IAnimationGenerationOptions,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_EXTEND_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isToAnimateEntry);
    entries[relativePath] = buildToAnimateEntry(
      metadata,
      action,
      prompt,
      resolveGenerationOptions(options, entries[relativePath]),
    );
    await writeMarkedImageMap(filePath, entries);
  });
};

export const removeToExtendEntry = async (
  rootPath: string,
  relativePath: string,
): Promise<void> => {
  const filePath = path.join(rootPath, TO_EXTEND_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isToAnimateEntry);
    if (relativePath in entries) {
      delete entries[relativePath];
      await writeMarkedImageMap(filePath, entries);
    }
  });
};

export const isVideoLink = (value: unknown): value is IVideoLink => {
  return (
    isPlainObjectRecord(value) &&
    typeof value.sourceRelativePath === "string" &&
    (value.sourceMediaType === "image" || value.sourceMediaType === "video") &&
    typeof value.action === "string" &&
    typeof value.prompt === "string" &&
    typeof value.metadata === "string" &&
    typeof value.linkedAt === "number"
  );
};

export const readVideoLinks = async (rootPath: string): Promise<Record<string, IVideoLink>> => {
  return readMarkedImageMap(path.join(rootPath, VIDEO_LINKS_FILE_NAME), isVideoLink);
};

export const removeVideoLink = async (rootPath: string, relativePath: string): Promise<void> => {
  const filePath = path.join(rootPath, VIDEO_LINKS_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isVideoLink);
    if (relativePath in entries) {
      delete entries[relativePath];
      await writeMarkedImageMap(filePath, entries);
    }
  });
};

// Rekeys a link when its video is renamed (Redraw-on-video), returning the migrated record, or
// null when the renamed video had no link (nothing to migrate).
export const migrateVideoLink = async (
  rootPath: string,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<IVideoLink | null> => {
  const filePath = path.join(rootPath, VIDEO_LINKS_FILE_NAME);
  return withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isVideoLink);
    const link = entries[oldRelativePath];
    if (!link) {
      return null;
    }

    delete entries[oldRelativePath];
    entries[newRelativePath] = link;
    await writeMarkedImageMap(filePath, entries);
    return link;
  });
};

// Deletes a to-animate.json/to-extends.json entry only if it still deep-equals what
// reconciliation observed when it built the claim being fulfilled, so a concurrent PUT that
// changed or replaced the mark in the window between reading claims and removing them here
// survives instead of being silently discarded. Compares against the *normalized* entry (prompt
// defaulted to "" when absent), matching what buildPendingAnimationClaims read the claim from -
// comparing raw disk entries would never match a legacy mark file written before `prompt`
// existed, since it lacks the key entirely.
export const removeMarkedImageMapEntryIfUnchanged = async (
  filePath: string,
  relativePath: string,
  expectedEntry: IToAnimateEntry,
): Promise<void> => {
  await withMarkedImageFileLock(filePath, async () => {
    const rawEntries = await readMarkedImageMap(filePath, isToAnimateEntry);
    const currentEntry = normalizeToAnimateEntries(rawEntries)[relativePath];
    if (currentEntry && JSON.stringify(currentEntry) === JSON.stringify(expectedEntry)) {
      delete rawEntries[relativePath];
      await writeMarkedImageMap(filePath, rawEntries);
    }
  });
};

const isCustomPoseEntry = (value: unknown): value is number => typeof value === "number";

// Items the Pose Conformity tool was told to leave alone ("Custom"), keyed by relativePath with
// the time they were marked.
export const readCustomPoseEntries = async (rootPath: string): Promise<Record<string, number>> => {
  return readMarkedImageMap(path.join(rootPath, CUSTOM_POSES_FILE_NAME), isCustomPoseEntry);
};

export const setCustomPoseEntry = async (rootPath: string, relativePath: string): Promise<void> => {
  const filePath = path.join(rootPath, CUSTOM_POSES_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isCustomPoseEntry);
    entries[normalizeRelativePath(relativePath)] = Date.now();
    await writeMarkedImageMap(filePath, entries);
  });
};

const removeCustomPoseEntry = async (rootPath: string, relativePath: string): Promise<void> => {
  const filePath = path.join(rootPath, CUSTOM_POSES_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isCustomPoseEntry);
    if (relativePath in entries) {
      delete entries[relativePath];
      await writeMarkedImageMap(filePath, entries);
    }
  });
};

// Called after an image or video is deleted or renamed (the old relativePath no longer refers
// to it), so any pending upscale/animate/extend/upscale-video mark tied to it is dropped rather
// than left dangling. Best-effort: the delete/rename it follows has already happened on disk,
// so a failure to clean up a mark (e.g. a transient disk error) must not surface as a failure of
// that larger operation.
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
      removeToExtendEntry(rootPath, normalizedPath),
      removeToUpscaleVideoEntry(rootPath, normalizedPath),
      removeCustomPoseEntry(rootPath, normalizedPath),
    ]);
  } catch {
    // Ignore: see comment above.
  }
};

const migrateMarkedImageMapKey = async <T>(
  filePath: string,
  isValidEntry: (value: unknown) => value is T,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> => {
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isValidEntry);
    if (!(oldRelativePath in entries)) {
      return;
    }

    entries[newRelativePath] = entries[oldRelativePath];
    delete entries[oldRelativePath];
    await writeMarkedImageMap(filePath, entries);
  });
};

// Repoints video links whose *source* is the renamed file, so a generated video keeps showing
// where it came from after its source image/video is renamed.
const migrateVideoLinkSources = async (
  rootPath: string,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> => {
  const filePath = path.join(rootPath, VIDEO_LINKS_FILE_NAME);
  await withMarkedImageFileLock(filePath, async () => {
    const entries = await readMarkedImageMap(filePath, isVideoLink);
    let hasChanges = false;
    for (const link of Object.values(entries)) {
      if (link.sourceRelativePath === oldRelativePath) {
        link.sourceRelativePath = newRelativePath;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      await writeMarkedImageMap(filePath, entries);
    }
  });
};

// Called after a manual rename: unlike Redraw (which frees the old name for a regeneration and
// so drops its marks), a rename is the same media under a new name, so every pending mark, the
// file's own video link, and any link sourced from it follow it to the new path. Best-effort for
// the same reason as removeMarkedActionEntries: the rename has already happened on disk.
export const migrateMarkedActionEntries = async (
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> => {
  const rootPath = getImagesRootPathFromEnv();

  if (!rootPath) {
    return;
  }

  const normalizedOldPath = normalizeRelativePath(oldRelativePath);
  const normalizedNewPath = normalizeRelativePath(newRelativePath);

  try {
    await Promise.all([
      migrateMarkedImageMapKey(
        path.join(rootPath, TO_UPSCALE_FILE_NAME),
        isRawMetadataEntry,
        normalizedOldPath,
        normalizedNewPath,
      ),
      migrateMarkedImageMapKey(
        path.join(rootPath, TO_ANIMATE_FILE_NAME),
        isToAnimateEntry,
        normalizedOldPath,
        normalizedNewPath,
      ),
      migrateMarkedImageMapKey(
        path.join(rootPath, TO_EXTEND_FILE_NAME),
        isToAnimateEntry,
        normalizedOldPath,
        normalizedNewPath,
      ),
      migrateMarkedImageMapKey(
        path.join(rootPath, TO_UPSCALE_VIDEO_FILE_NAME),
        isRawMetadataEntry,
        normalizedOldPath,
        normalizedNewPath,
      ),
      migrateMarkedImageMapKey(
        path.join(rootPath, CUSTOM_POSES_FILE_NAME),
        isCustomPoseEntry,
        normalizedOldPath,
        normalizedNewPath,
      ),
      migrateVideoLink(rootPath, normalizedOldPath, normalizedNewPath),
      migrateVideoLinkSources(rootPath, normalizedOldPath, normalizedNewPath),
    ]);
  } catch {
    // Ignore: see comment above.
  }
};
