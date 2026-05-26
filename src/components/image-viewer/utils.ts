import type { IImageItem, TStyle } from "@/types/library";
import { WITH_SOMEBODY_FILTER } from "@/components/image-viewer/constants";

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
): Array<{ value: string; label: string }> => {
  const nonWithPoses: Array<{ value: string; label: string }> = [];
  let hasWithPoses = false;

  for (const pose of poses) {
    if (pose.startsWith("With ")) {
      hasWithPoses = true;
      continue;
    }

    nonWithPoses.push({ value: pose, label: pose });
  }

  if (hasWithPoses) {
    nonWithPoses.push({ value: WITH_SOMEBODY_FILTER, label: "With Somebody" });
  }

  return nonWithPoses;
};
