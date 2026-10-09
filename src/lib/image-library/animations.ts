import { type IAnimationConfig, type IAnimationGenerationOptions } from "@/types/library";

import { isPlainObjectRecord } from "./shared";

// `prompt` may be a single string or an array of candidate lines; either way it normalizes to an
// array of its non-blank lines (a missing/malformed prompt normalizes to []).
const normalizeAnimationPrompt = (rawPrompt: unknown): string[] => {
  const lines = Array.isArray(rawPrompt) ? rawPrompt : [rawPrompt];
  return lines.filter((line): line is string => typeof line === "string" && line.trim() !== "");
};

const normalizeAnimationGenerationOptions = (
  entry: Record<string, unknown>,
): IAnimationGenerationOptions => {
  const options: IAnimationGenerationOptions = {};
  if (typeof entry.lora === "string" && entry.lora.trim()) {
    options.lora = entry.lora.trim();
  }
  if (typeof entry.trigger === "string" && entry.trigger.trim()) {
    options.trigger = entry.trigger.trim();
  }
  if (typeof entry.weight === "number" && Number.isFinite(entry.weight)) {
    options.weight = entry.weight;
  }
  return options;
};

// A single raw `animations` entry must be an object node with required key/name strings, a
// `prompt` (string or array of strings, see normalizeAnimationPrompt), optional lora/trigger/weight
// generation options, and optional recursively-normalized subVersions. A node with no prompt line
// and no (valid) subVersions has nothing to animate with and is skipped entirely - which includes
// legacy plain-string entries, since those never carried a prompt. Anything else (wrong types,
// missing key/name) is silently skipped too, matching readMarkedImageMap's existing leniency
// toward malformed entries elsewhere. `seenKeys` is shared across the whole tree (not just
// siblings), since findAnimationNodeByKey resolves by key alone: a key reused at a different
// nesting level would otherwise shadow the earlier node and make the later one unreachable (and
// produce duplicate React keys in the flattened UI menu).
const normalizeAnimationConfigEntry = (
  entry: unknown,
  seenKeys: Set<string>,
): IAnimationConfig | null => {
  if (!isPlainObjectRecord(entry)) {
    return null;
  }

  const key = typeof entry.key === "string" ? entry.key.trim() : "";
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!key || !name || seenKeys.has(key)) {
    return null;
  }
  seenKeys.add(key);

  const prompt = normalizeAnimationPrompt(entry.prompt);
  const subVersions = Array.isArray(entry.subVersions)
    ? normalizeAnimationEntries(entry.subVersions, seenKeys)
    : [];

  if (prompt.length === 0 && subVersions.length === 0) {
    return null;
  }

  const node: IAnimationConfig = {
    key,
    name,
    prompt,
    ...normalizeAnimationGenerationOptions(entry),
  };
  return subVersions.length > 0 ? { ...node, subVersions } : node;
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

const pickRandom = <T>(items: T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export interface IAnimationSelection {
  node: IAnimationConfig;
  prompt: string;
}

// Resolves what marking an image with `node` actually requests: a node with no prompt line stands
// for "any of my subVersions", so descend into a random one until reaching a node that has prompt
// lines (normalizeAnimationsConfig guarantees one exists), then pick one of its lines at random.
export const selectAnimation = (
  node: IAnimationConfig,
  random: () => number = Math.random,
): IAnimationSelection => {
  let selected = node;
  while (selected.prompt.length === 0 && selected.subVersions?.length) {
    selected = pickRandom(selected.subVersions, random);
  }

  return {
    node: selected,
    prompt: selected.prompt.length > 0 ? pickRandom(selected.prompt, random) : "",
  };
};
