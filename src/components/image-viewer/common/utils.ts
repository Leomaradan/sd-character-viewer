import type { IImageItem, IPosePatternFilter } from "@/types/library";

export const getImageUrl = (relativePath: string, options?: { preview?: boolean }): string => {
  const variantParam = options?.preview ? "&variant=preview" : "";
  return `/api/image?path=${encodeURIComponent(relativePath)}${variantParam}`;
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
  const uniquePoses = new Set(images.map((image) => image.poseBaseName));
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
