import type { IImageItem, TMajorFilter, TStyle } from "@/types/library";
import { WITH_SOMEBODY_FILTER } from "@/components/image-viewer/constants";

export function getImageUrl(relativePath: string): string {
  return `/api/image?path=${encodeURIComponent(relativePath)}`;
}

export function formatMajorFilterLabel(majorFilter: TMajorFilter): string {
  if (majorFilter === "character") {
    return "Filter by Character";
  }

  if (majorFilter === "style") {
    return "Filter by Style";
  }

  return "Filter by Pose";
}

export function formatStyleLabel(style: TStyle): string {
  if (style === "3d") {
    return "3D";
  }

  if (style === "anime") {
    return "Anime";
  }

  return "Realistic";
}

export function buildPoseOptions(images: IImageItem[]): string[] {
  const uniquePoses = new Set(images.map((image) => image.poseBaseName));
  return [...uniquePoses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function buildPoseFilterOptions(poses: string[]): Array<{ value: string; label: string }> {
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
}
