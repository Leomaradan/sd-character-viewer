import type { IImageItem, IPosePatternFilter, TStyle } from "@/types/library";

export const getImageUrl = (relativePath: string): string => {
  return `/api/image?path=${encodeURIComponent(relativePath)}`;
};

export const formatStyleLabel = (style: TStyle): string => {
  if (style === "3d") {
    return "3D";
  }

  if (style === "anime") {
    return "Anime";
  }

  return "Realistic";
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
