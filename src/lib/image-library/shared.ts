import path from "node:path";

// Tiny, dependency-free helpers shared across the image-library submodules. Kept here (rather
// than duplicated, or left in index.ts and imported back) so no submodule ever needs to import
// from index.ts - that would create a cycle, since index.ts imports from the submodules.

export const isPlainObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const normalizeRelativePath = (filePath: string): string => {
  return filePath.split(path.sep).join(path.posix.sep);
};

export const compareNatural = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};
