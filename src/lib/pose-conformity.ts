import type { IImageItem, TMediaType } from "@/types/library";

import { splitAnimationPose, splitVariantSuffix, stripAnnotations } from "./pose-name";

// The thumbnail pose is always allowed, so the tool never proposes renaming a character's Base.
const ALWAYS_CONFORMING_POSES = ["Base"];

// An item conforms when its pose (poseFilterName: annotations and variant number ignored, and
// only the pose part of an "Animation (Pose)" video) is one of the standard poses, compared
// case-insensitively. An item matching a pose-filters.json pattern ("With Somebody"...) has its
// pose defined by that pattern, so it conforms too.
export const isPoseConforming = (
  item: Pick<IImageItem, "poseFilterName" | "posePatternFilterIds">,
  standardPoses: readonly string[],
): boolean => {
  if (item.posePatternFilterIds.length > 0) {
    return true;
  }

  const allowedPoses = new Set(
    [...standardPoses, ...ALWAYS_CONFORMING_POSES].map((pose) => pose.toLowerCase()),
  );
  return allowedPoses.has(item.poseFilterName.trim().toLowerCase());
};

// Annotations kept verbatim across a rename: "[...]" parts and "(no lora)".
const ANNOTATION_REGEX = /\[[^\]]*\]|\(\s*no\s+lora\s*\)/gi;
const collectAnnotations = (name: string): string[] => {
  return [...name.matchAll(ANNOTATION_REGEX)].map((match) => match[0]);
};

// The file stem an item should get to match `targetPose`, from its current raw stem:
// - images, and videos without an "Animation (Pose)" name, become just the pose;
// - "Animation (Pose)" videos keep the animation and swap the pose part, unless the target is
//   the animation itself ("Dancing (Test)" + "Dancing" -> "Dancing", not "Dancing (Dancing)");
// - the variant number is dropped (a free number is picked again on conflict), and annotations
//   ("[...]", "(no lora)") are kept at the end.
export const buildConformedStem = (
  rawStem: string,
  mediaType: TMediaType,
  targetPose: string,
): string => {
  const target = targetPose.trim();
  const annotations = collectAnnotations(rawStem);
  const { base } = splitVariantSuffix(stripAnnotations(rawStem) || rawStem.trim());
  const animationPose = mediaType === "video" ? splitAnimationPose(base) : null;
  const keepsAnimation =
    animationPose !== null && animationPose.animation.toLowerCase() !== target.toLowerCase();
  const core = keepsAnimation ? `${animationPose.animation} (${target})` : target;

  return annotations.length > 0 ? `${core} ${annotations.join(" ")}` : core;
};

// Numbers a stem for a conflict-free name, after everything else (annotations included):
// ("Casual [Upscaled]", 2) -> "Casual [Upscaled] 2". The number stays the name's trailing variant
// number, so the Duplicate Finder groups "Casual [Upscaled] 2" with "Casual [Upscaled]".
export const insertVariantNumber = (stem: string, variant: number): string => {
  return `${stem.trimEnd()} ${variant}`;
};
