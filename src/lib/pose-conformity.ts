import type { IImageItem, TMediaType } from "@/types/library";

import { splitAnimationPose, splitVariantSuffix, stripBracketParts } from "./pose-name";

// The thumbnail pose is always allowed, so the tool never proposes renaming a character's Base.
const ALWAYS_CONFORMING_POSES = ["Base"];

// An item conforms when its pose (poseFilterName: bracket annotations and variant number
// ignored, and only the pose part of an "Animation (Pose)" video) is one of the standard poses,
// compared case-insensitively.
export const isPoseConforming = (
  item: Pick<IImageItem, "poseFilterName">,
  standardPoses: readonly string[],
): boolean => {
  const allowedPoses = new Set(
    [...standardPoses, ...ALWAYS_CONFORMING_POSES].map((pose) => pose.toLowerCase()),
  );
  return allowedPoses.has(item.poseFilterName.trim().toLowerCase());
};

// Splits a name into its text and the trailing "[...]" annotations (kept verbatim):
// "Casual 2 [Upscaled]" -> { head: "Casual 2", brackets: " [Upscaled]" }. Done by scanning
// rather than a regex so no input can make it backtrack.
const splitTrailingBrackets = (name: string): { head: string; brackets: string } => {
  let head = name.trimEnd();
  let brackets = "";

  while (head.endsWith("]")) {
    const openIndex = head.lastIndexOf("[");
    if (openIndex < 0) {
      break;
    }
    brackets = `${head.slice(openIndex)}${brackets ? ` ${brackets}` : ""}`;
    head = head.slice(0, openIndex).trimEnd();
  }

  return { head, brackets: brackets ? ` ${brackets}` : "" };
};

const collectBracketParts = (name: string): string[] => {
  const parts: string[] = [];
  let searchFrom = 0;

  while (searchFrom < name.length) {
    const openIndex = name.indexOf("[", searchFrom);
    const closeIndex = openIndex < 0 ? -1 : name.indexOf("]", openIndex);
    if (closeIndex < 0) {
      break;
    }
    parts.push(name.slice(openIndex, closeIndex + 1));
    searchFrom = closeIndex + 1;
  }

  return parts;
};

// The file stem an item should get to match `targetPose`, from its current raw stem:
// - images, and videos without an "Animation (Pose)" name, become just the pose;
// - "Animation (Pose)" videos keep the animation and swap the pose part, unless the target is
//   the animation itself ("Dancing (Test)" + "Dancing" -> "Dancing", not "Dancing (Dancing)");
// - the variant number is dropped (a free number is picked again on conflict), and "[...]"
//   annotations are kept at the end.
export const buildConformedStem = (
  rawStem: string,
  mediaType: TMediaType,
  targetPose: string,
): string => {
  const target = targetPose.trim();
  const bracketParts = collectBracketParts(rawStem);
  const { base } = splitVariantSuffix(stripBracketParts(rawStem) || rawStem.trim());
  const animationPose = mediaType === "video" ? splitAnimationPose(base) : null;
  const keepsAnimation =
    animationPose !== null && animationPose.animation.toLowerCase() !== target.toLowerCase();
  const core = keepsAnimation ? `${animationPose.animation} (${target})` : target;

  return bracketParts.length > 0 ? `${core} ${bracketParts.join(" ")}` : core;
};

// Numbers a stem for a conflict-free name, before any trailing "[...]" annotations:
// ("Casual [Upscaled]", 2) -> "Casual 2 [Upscaled]".
export const insertVariantNumber = (stem: string, variant: number): string => {
  const { head, brackets } = splitTrailingBrackets(stem);
  return `${head} ${variant}${brackets}`;
};
