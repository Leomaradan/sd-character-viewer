// Node-only helpers for resolving SD_EXTRA_IMAGES_ROOT into concrete image-root directories.
// Kept as plain JS (rather than TypeScript) so this exact logic can be shared, unmodified,
// between the Next.js app (src/lib/image-library.ts) and the standalone
// scripts/sync-first-seen-from-creation-dates.mjs CLI, which runs outside the Next.js/TS build
// and can only import plain JS/Node modules.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// Extra image roots are exposed to the client as a virtual relativePath prefix
// (e.g. "extra-roots/0/characters/3d/Anna/Base.png") so the same "path" query param used to
// view/delete/rename a main-root image can also address an image living in an extra root,
// without colliding with a same-named file in the main root or another extra root.
export const EXTRA_ROOT_PATH_SEGMENT = "extra-roots";

export const buildExtraRootRelativePrefix = (extraRootIndex) => {
  return `${EXTRA_ROOT_PATH_SEGMENT}/${extraRootIndex}`;
};

export const directoryHasCharactersFolder = (directoryPath) => {
  try {
    return statSync(path.join(directoryPath, "characters")).isDirectory();
  } catch {
    return false;
  }
};

const compareNatural = (a, b) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

// Each configured entry is either an images root itself (it directly contains a "characters"
// folder) or a parent directory whose immediate subdirectories are each their own images root
// (useful for Docker, where a single bind mount can only map one host path: mounting a parent
// directory lets several unrelated host folders act as separate extra roots).
export const resolveExtraImageRoots = (rawEnvValue) => {
  const rawValue = rawEnvValue?.trim();

  if (!rawValue) {
    return [];
  }

  const configuredPaths = rawValue
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const resolvedRoots = [];

  for (const configuredPath of configuredPaths) {
    if (directoryHasCharactersFolder(configuredPath)) {
      resolvedRoots.push(path.resolve(configuredPath));
      continue;
    }

    let entries;
    try {
      entries = readdirSync(configuredPath, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    const subdirectoryRoots = entries
      // A symlinked subdirectory is reported as a symlink, not a directory, by Dirent; treat it
      // the same as a real directory (directoryHasCharactersFolder follows symlinks via
      // statSync), matching how a symlink is already accepted when it's the configured entry
      // itself rather than one of its subdirectories.
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => directoryHasCharactersFolder(path.join(configuredPath, name)))
      .sort(compareNatural)
      .map((name) => path.resolve(path.join(configuredPath, name)));

    resolvedRoots.push(...subdirectoryRoots);
  }

  return [...new Set(resolvedRoots)];
};
