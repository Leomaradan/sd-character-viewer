import type {
  ICharacterSummary,
  IImageItem,
  IMetadataFilterOption,
  IPosePatternFilter,
} from "@/types/library";

export const isVideoRelativePath = (relativePath: string): boolean => {
  return relativePath.toLowerCase().endsWith(".mp4");
};

export const getImageUrl = (
  relativePath: string,
  options?: { preview?: boolean; timestamp?: number | null },
): string => {
  const timestamp = options?.timestamp;
  const timestampParam =
    typeof timestamp === "number" && Number.isFinite(timestamp)
      ? `&t=${Math.trunc(timestamp)}`
      : "";
  const variantParam = options?.preview ? "&variant=preview" : "";
  return `/api/image?path=${encodeURIComponent(relativePath)}${timestampParam}${variantParam}`;
};

export const formatStyleLabel = (
  style: string,
  styleLabels?: Partial<Record<string, string>>,
): string => {
  const configuredLabel = styleLabels?.[style]?.trim();
  if (configuredLabel) {
    return configuredLabel;
  }

  if (style === "3d") {
    return "3D";
  }

  const normalized = style.trim();
  if (!normalized) {
    return "Unknown";
  }

  return normalized
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export const buildPoseOptions = (images: IImageItem[]): string[] => {
  const uniquePoses = new Set(images.map((image) => image.poseFilterName));
  return [...uniquePoses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

export const buildPoseFilterOptions = (
  poses: string[],
  posePatternFilters: IPosePatternFilter[],
): Array<{ value: string; label: string }> => {
  const nonPatternPoses: Array<{ value: string; label: string }> = [];
  const matchingPatternFilterIds = new Set<string>();

  const compiledPatternFilters = posePatternFilters
    .map((filter) => {
      try {
        return { ...filter, regex: new RegExp(filter.pattern, filter.flags) };
      } catch {
        return null;
      }
    })
    .filter((filter): filter is IPosePatternFilter & { regex: RegExp } => filter !== null);

  for (const pose of poses) {
    const matchedFilters = compiledPatternFilters.filter((filter) => filter.regex.test(pose));

    if (matchedFilters.length > 0) {
      for (const matchedFilter of matchedFilters) {
        matchingPatternFilterIds.add(matchedFilter.id);
      }
    } else {
      nonPatternPoses.push({ value: pose, label: pose });
    }
  }

  const matchingPatternFilters = posePatternFilters
    .filter((filter) => matchingPatternFilterIds.has(filter.id))
    .map((filter) => ({ value: filter.id, label: filter.label }));

  return [...nonPatternPoses, ...matchingPatternFilters];
};

export const pickRandomItem = <T>(
  items: readonly T[],
  random: () => number = Math.random,
): T | null => {
  if (items.length === 0) {
    return null;
  }

  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index];
};

export const filterCharactersByMetadataOption = (
  characters: ICharacterSummary[],
  option: IMetadataFilterOption | undefined,
): ICharacterSummary[] => {
  if (!option) {
    return characters;
  }

  const selectedValue = option.value.trim().toLowerCase();
  return characters.filter((character) =>
    [character.category, character.serie, ...character.tags].some(
      (value) => value?.trim().toLowerCase() === selectedValue,
    ),
  );
};

const FIRST_SEEN_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export const formatFirstSeenDate = (timestamp: number): string | null => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp).toLocaleDateString(undefined, FIRST_SEEN_DATE_FORMAT);
};
