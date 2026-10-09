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
const NO_LORA_REGEX = /^\(\s*no\s+lora\s*\)$/i;

// Start index of the annotation `name` ends with ("[...]" or "(no lora)"), or -1.
const findTrailingAnnotationStart = (name: string): number => {
  if (name.endsWith("]")) {
    return name.lastIndexOf("[");
  }

  if (name.endsWith(")")) {
    const openIndex = name.lastIndexOf("(");
    return openIndex >= 0 && NO_LORA_REGEX.test(name.slice(openIndex)) ? openIndex : -1;
  }

  return -1;
};

// Splits a name into its text and its trailing annotations (kept verbatim):
// "Casual 2 [Upscaled] (no lora)" -> { head: "Casual 2", annotations: " [Upscaled] (no lora)" }.
const splitTrailingAnnotations = (name: string): { head: string; annotations: string } => {
  let head = name.trimEnd();
  let annotations = "";

  for (
    let annotationStart = findTrailingAnnotationStart(head);
    annotationStart >= 0;
    annotationStart = findTrailingAnnotationStart(head)
  ) {
    annotations = `${head.slice(annotationStart)}${annotations ? ` ${annotations}` : ""}`;
    head = head.slice(0, annotationStart).trimEnd();
  }

  return { head, annotations: annotations ? ` ${annotations}` : "" };
};

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

// Numbers a stem for a conflict-free name, before any trailing annotations:
// ("Casual [Upscaled]", 2) -> "Casual 2 [Upscaled]", ("Casual (no lora)", 2) -> "Casual 2 (no lora)".
export const insertVariantNumber = (stem: string, variant: number): string => {
  const { head, annotations } = splitTrailingAnnotations(stem);
  return `${head} ${variant}${annotations}`;
};
