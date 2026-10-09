import { promises as fs } from "node:fs";
import path from "node:path";

import { migrateFirstSeenCacheEntry, removeLibraryIndexCache } from "./cache";
import { migrateMarkedActionEntries } from "./marks";
import {
  isPreviewSidecarFileName,
  isTemporaryRenameFileName,
  resolveImageFilePath,
  resolvePreviewFilePath,
} from "./paths";

export type TMediaRenameErrorCode = "invalid-path" | "invalid-name" | "not-found" | "conflict";

export class MediaRenameError extends Error {
  readonly code: TMediaRenameErrorCode;

  constructor(code: TMediaRenameErrorCode, message: string) {
    super(message);
    this.name = "MediaRenameError";
    this.code = code;
  }
}

const MAX_STEM_LENGTH = 200;
// Path separators plus the characters Windows forbids in file names, so a library shared across
// operating systems never ends up with a name one of them can't open.
// oxlint-disable-next-line no-control-regex
const FORBIDDEN_STEM_CHARACTERS = /[/\\<>:"|?*\u0000-\u001F]/;

// Returns the trimmed stem, or null when it can't be used as a media file name: it must be
// non-empty, a plain name (no path separators), not hidden (no leading "."), and short enough.
export const normalizeMediaStem = (rawStem: string): string | null => {
  const stem = rawStem.trim();

  if (
    stem === "" ||
    stem.length > MAX_STEM_LENGTH ||
    stem.startsWith(".") ||
    stem.endsWith(".") ||
    FORBIDDEN_STEM_CHARACTERS.test(stem)
  ) {
    return null;
  }

  return stem;
};

const renamePreviewSidecar = async (oldFilePath: string, newFilePath: string): Promise<void> => {
  const oldPreviewPath = resolvePreviewFilePath(oldFilePath);
  const newPreviewPath = resolvePreviewFilePath(newFilePath);

  try {
    await fs.rename(oldPreviewPath, newPreviewPath);
  } catch {
    // No preview for the renamed file: drop any stale one left under the new name, so the grid
    // doesn't show some other (deleted) file's thumbnail for it.
    await fs.unlink(newPreviewPath).catch(() => {});
  }
};

// Renames a media file within its own folder to `newStem` + its current extension, carrying its
// preview sidecar, first-seen date, marks, and video links along. Throws MediaRenameError when
// the path/name is invalid, the file is gone, or another file already uses the target name
// (compared case-insensitively, so it also holds on case-insensitive filesystems). Returns the
// new relativePath (unchanged when the name didn't change).
export const renameMediaFile = async (relativePath: string, newStem: string): Promise<string> => {
  // Only canonical paths (no "./" or in-tree ".." segments): the bookkeeping files key entries by
  // the exact relativePath, so an aliased spelling would resolve on disk but miss its entries.
  const filePath =
    path.posix.normalize(relativePath) === relativePath ? resolveImageFilePath(relativePath) : null;

  if (!filePath) {
    throw new MediaRenameError("invalid-path", "Invalid image path");
  }

  const stem = normalizeMediaStem(newStem);
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName);
  const newFileName = stem ? `${stem}${extension}` : "";

  if (!stem || isPreviewSidecarFileName(newFileName) || isTemporaryRenameFileName(newFileName)) {
    throw new MediaRenameError("invalid-name", "This name can't be used for a file.");
  }

  const directory = path.dirname(filePath);
  let entries: string[];

  try {
    entries = await fs.readdir(directory);
  } catch {
    throw new MediaRenameError("not-found", "File not found");
  }

  if (!entries.includes(fileName)) {
    throw new MediaRenameError("not-found", "File not found");
  }

  if (newFileName === fileName) {
    return relativePath;
  }

  const lowerNewFileName = newFileName.toLowerCase();
  const conflictingEntry = entries.find(
    (entry) => entry !== fileName && entry.toLowerCase() === lowerNewFileName,
  );

  if (conflictingEntry) {
    throw new MediaRenameError("conflict", `A file named "${conflictingEntry}" already exists.`);
  }

  // Same folder, same extension, and a separator-free stem, so the new path stays inside the
  // subtree resolveImageFilePath already validated for the old one.
  const newRelativePath = `${relativePath.slice(0, relativePath.length - fileName.length)}${newFileName}`;
  const newFilePath = path.join(directory, newFileName);

  await fs.rename(filePath, newFilePath);
  await renamePreviewSidecar(filePath, newFilePath);
  // Both migrations are best-effort (they swallow their own persistence errors): the file has
  // already moved, so a bookkeeping failure must not surface as a failed rename.
  await migrateFirstSeenCacheEntry(relativePath, newRelativePath);
  await migrateMarkedActionEntries(relativePath, newRelativePath);
  await removeLibraryIndexCache();

  return newRelativePath;
};
