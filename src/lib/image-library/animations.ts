import { type IAnimationConfig } from "@/types/library";

import { isPlainObjectRecord } from "./shared";

// A single raw `animations` entry: either a plain string (legacy leaf, auto-migrated to
// {key: s, name: s, prompt: ""}) or an object node with required key/name strings, an optional
// prompt string (defaulting to ""), and optional recursively-normalized subVersions. Anything
// else (wrong types, missing key/name) is silently skipped, matching readMarkedImageMap's
// existing leniency toward malformed entries elsewhere in this file. `seenKeys` is shared across
// the whole tree (not just siblings), since findAnimationNodeByKey resolves by key alone: a key
// reused at a different nesting level would otherwise shadow the earlier node and make the
// later one unreachable (and produce duplicate React keys in the flattened UI menu).
const normalizeAnimationConfigEntry = (
  entry: unknown,
  seenKeys: Set<string>,
): IAnimationConfig | null => {
  if (typeof entry === "string") {
    const trimmedName = entry.trim();
    if (!trimmedName || seenKeys.has(trimmedName)) {
      return null;
    }
    seenKeys.add(trimmedName);
    return { key: trimmedName, name: trimmedName, prompt: "" };
  }

  if (!isPlainObjectRecord(entry)) {
    return null;
  }

  const key = typeof entry.key === "string" ? entry.key.trim() : "";
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!key || !name || seenKeys.has(key)) {
    return null;
  }
  seenKeys.add(key);

  const prompt = typeof entry.prompt === "string" ? entry.prompt : "";
  const subVersions = Array.isArray(entry.subVersions)
    ? normalizeAnimationEntries(entry.subVersions, seenKeys)
    : [];

  return subVersions.length > 0 ? { key, name, prompt, subVersions } : { key, name, prompt };
};

const normalizeAnimationEntries = (raw: unknown[], seenKeys: Set<string>): IAnimationConfig[] => {
  const nodes: IAnimationConfig[] = [];

  for (const rawEntry of raw) {
    const node = normalizeAnimationConfigEntry(rawEntry, seenKeys);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
};

export const normalizeAnimationsConfig = (raw: unknown): IAnimationConfig[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return normalizeAnimationEntries(raw, new Set<string>());
};

export const findAnimationNodeByKey = (
  animations: IAnimationConfig[],
  key: string,
): IAnimationConfig | null => {
  for (const node of animations) {
    if (node.key === key) {
      return node;
    }

    const foundInSubVersions = node.subVersions
      ? findAnimationNodeByKey(node.subVersions, key)
      : null;
    if (foundInSubVersions) {
      return foundInSubVersions;
    }
  }

  return null;
};
