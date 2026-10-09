import type { TMediaType } from "@/types/library";

// Pure, dependency-free pose-name helpers shared by the library index (server) and, later, the
// pose tools. They operate on an already-sanitized file stem (no extension, "_"/"-" turned into
// spaces - see parsePoseName in image-library).

const BRACKET_PART_REGEX = /\s*\[[^\]]*\]\s*/g;
const ANIMATION_POSE_REGEX = /^(.+?)\s*\(([^()]+)\)$/;

// Drops "[...]" annotations such as "[Upscaled]" or "[Extended]" wherever they appear:
// "Casual 2 [Upscaled]" -> "Casual 2".
export const stripBracketParts = (name: string): string => {
  return name.replaceAll(BRACKET_PART_REGEX, " ").replaceAll(/\s+/g, " ").trim();
};

// Splits a trailing variant number off a name: "Casual 2" -> { base: "Casual", variant: 2 },
// "Casual" -> { base: "Casual", variant: 1 }. A name that is only digits is kept whole.
export const splitVariantSuffix = (name: string): { base: string; variant: number } => {
  const match = /^(.*?)\s*(\d+)$/.exec(name);
  const base = match?.[1].trim() ?? "";

  if (!match || base === "") {
    return { base: name, variant: 1 };
  }

  return { base, variant: Number.parseInt(match[2], 10) };
};

// Splits a video name of the form "Animation (Pose)" into its two parts:
// "Dancing (Casual)" -> { animation: "Dancing", pose: "Casual" }. Returns null when the name
// has no trailing parenthesised pose part.
export const splitAnimationPose = (name: string): { animation: string; pose: string } | null => {
  const match = ANIMATION_POSE_REGEX.exec(name.trim());

  if (!match) {
    return null;
  }

  const animation = match[1].trim();
  const pose = match[2].trim();
  return animation && pose ? { animation, pose } : null;
};

// The name an item is filtered by in the pose filters: bracket annotations and the variant
// number are ignored, and for a video named "Animation (Pose)" only the pose part counts.
// "Casual 2 [Upscaled]" -> "Casual"; "Dancing (Casual) 2 [Extended]" (video) -> "Casual".
export const getPoseFilterName = (sanitizedStem: string, mediaType: TMediaType): string => {
  const withoutBrackets = stripBracketParts(sanitizedStem) || sanitizedStem.trim();
  const { base } = splitVariantSuffix(withoutBrackets);

  if (mediaType === "video") {
    const animationPose = splitAnimationPose(base);
    if (animationPose) {
      return animationPose.pose;
    }
  }

  return base;
};
