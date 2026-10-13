"use client";

import AnimationIcon from "@mui/icons-material/Animation";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import ThumbsUpDownIcon from "@mui/icons-material/ThumbsUpDown";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import { Alert, Button, ButtonGroup, CircularProgress } from "@mui/material";
import { useCallback } from "react";

import type { TRating } from "@/types/library";

const DELETE_ERROR_SX = { fontSize: "0.75rem" };
const RATING_GROUP_SX = { alignSelf: "flex-start" };
const BAD_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#f44336",
  "&:hover": { borderColor: "#f44336", bgcolor: "rgba(244,67,54,0.08)" },
};
const BAD_BUTTON_ACTIVE_SX = {
  ...BAD_BUTTON_SX,
  borderColor: "#f44336",
  bgcolor: "rgba(244,67,54,0.24)",
};
const OK_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#2196f3",
  "&:hover": { borderColor: "#2196f3", bgcolor: "rgba(33,150,243,0.08)" },
};
const OK_BUTTON_ACTIVE_SX = {
  ...OK_BUTTON_SX,
  borderColor: "#2196f3",
  bgcolor: "rgba(33,150,243,0.24)",
};
const GOOD_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#4caf50",
  "&:hover": { borderColor: "#4caf50", bgcolor: "rgba(76,175,80,0.08)" },
};
const GOOD_BUTTON_ACTIVE_SX = {
  ...GOOD_BUTTON_SX,
  borderColor: "#4caf50",
  bgcolor: "rgba(76,175,80,0.24)",
};
const UPSCALE_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#9c27b0",
  "&:hover": { borderColor: "#9c27b0", bgcolor: "rgba(156,39,176,0.08)" },
};
const UPSCALE_BUTTON_ACTIVE_SX = {
  ...UPSCALE_BUTTON_SX,
  borderColor: "#9c27b0",
  bgcolor: "rgba(156,39,176,0.24)",
};
const ANIMATE_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#ff9800",
  "&:hover": { borderColor: "#ff9800", bgcolor: "rgba(255,152,0,0.08)" },
};
const ANIMATE_BUTTON_ACTIVE_SX = {
  ...ANIMATE_BUTTON_SX,
  borderColor: "#ff9800",
  bgcolor: "rgba(255,152,0,0.24)",
};
const EDIT_PROMPT_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#4caf50",
  "&:hover": { borderColor: "#4caf50", bgcolor: "rgba(76,175,80,0.08)" },
};
const DELETE_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#f44336",
  "&:hover": { borderColor: "#f44336", bgcolor: "rgba(244,67,54,0.08)" },
};

// Split out of ImageDetailModal so its own branches (error alerts, per-media-type button
// gating) don't count against that component's cognitive complexity - this is pure prop
// plumbing, not a state owner, so a flat prop list (rather than a memoized-object grouping,
// which would trip the no-new-object-as-prop lint rule on every render) is the simplest fit.
interface IImageDetailActionsProps {
  deleteError: string | null;
  redrawError: string | null;
  upscaleError: string | null;
  animateError: string | null;
  upscaleVideoError: string | null;
  extendError: string | null;
  isVideo: boolean;
  hasAnimations: boolean;
  isRedrawing: boolean;
  onRedraw: () => void;
  rating: TRating | null;
  isRating: boolean;
  ratingError: string | null;
  onRate: (rating: TRating) => void;
  isTogglingUpscale: boolean;
  isUpscaleMarked: boolean;
  onToggleUpscale: () => void;
  isTogglingAnimate: boolean;
  animateAction: string | null;
  animateActionLabel: string;
  onOpenAnimateMenu: (event: React.MouseEvent<HTMLElement>) => void;
  isTogglingUpscaleVideo: boolean;
  isUpscaleVideoMarked: boolean;
  onToggleUpscaleVideo: () => void;
  isTogglingExtend: boolean;
  extendAction: string | null;
  extendActionLabel: string;
  onOpenExtendMenu: (event: React.MouseEvent<HTMLElement>) => void;
  canEditAnimationPrompt: boolean;
  onOpenEditPrompt: () => void;
  isDeleting: boolean;
  deleteLabel: string;
  onDelete: () => void;
}

export function ImageDetailActions({
  deleteError,
  redrawError,
  upscaleError,
  animateError,
  upscaleVideoError,
  extendError,
  isVideo,
  hasAnimations,
  isRedrawing,
  onRedraw,
  rating,
  isRating,
  ratingError,
  onRate,
  isTogglingUpscale,
  isUpscaleMarked,
  onToggleUpscale,
  isTogglingAnimate,
  animateAction,
  animateActionLabel,
  onOpenAnimateMenu,
  isTogglingUpscaleVideo,
  isUpscaleVideoMarked,
  onToggleUpscaleVideo,
  isTogglingExtend,
  extendAction,
  extendActionLabel,
  onOpenExtendMenu,
  canEditAnimationPrompt,
  onOpenEditPrompt,
  isDeleting,
  deleteLabel,
  onDelete,
}: Readonly<IImageDetailActionsProps>) {
  // Bad runs Redraw (rename + "bad" rating); on a file already rated bad it just clears the rating.
  const handleBad = useCallback(() => {
    if (rating === "bad") {
      onRate("bad");
    } else {
      onRedraw();
    }
  }, [rating, onRate, onRedraw]);
  const handleRateOk = useCallback(() => {
    onRate("ok");
  }, [onRate]);
  const handleRateGood = useCallback(() => {
    onRate("good");
  }, [onRate]);

  return (
    <>
      {deleteError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {deleteError}
        </Alert>
      )}
      {redrawError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {redrawError}
        </Alert>
      )}
      {ratingError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {ratingError}
        </Alert>
      )}
      {upscaleError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {upscaleError}
        </Alert>
      )}
      {animateError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {animateError}
        </Alert>
      )}
      {upscaleVideoError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {upscaleVideoError}
        </Alert>
      )}
      {extendError && (
        <Alert severity="error" sx={DELETE_ERROR_SX}>
          {extendError}
        </Alert>
      )}
      {/* "Bad" is the Redraw action: the file is renamed so the pose can be generated again, and
          the renamed file is rated "bad". */}
      <ButtonGroup variant="outlined" size="small" aria-label="Rating" sx={RATING_GROUP_SX}>
        <Button
          startIcon={<ThumbDownIcon />}
          onClick={handleBad}
          disabled={isRedrawing || isRating}
          aria-pressed={rating === "bad"}
          sx={rating === "bad" ? BAD_BUTTON_ACTIVE_SX : BAD_BUTTON_SX}
        >
          {isRedrawing ? <CircularProgress size={18} /> : "Bad"}
        </Button>
        <Button
          startIcon={<ThumbsUpDownIcon />}
          onClick={handleRateOk}
          disabled={isRedrawing || isRating}
          aria-pressed={rating === "ok"}
          sx={rating === "ok" ? OK_BUTTON_ACTIVE_SX : OK_BUTTON_SX}
        >
          OK
        </Button>
        <Button
          startIcon={<ThumbUpIcon />}
          onClick={handleRateGood}
          disabled={isRedrawing || isRating}
          aria-pressed={rating === "good"}
          sx={rating === "good" ? GOOD_BUTTON_ACTIVE_SX : GOOD_BUTTON_SX}
        >
          Good
        </Button>
      </ButtonGroup>
      <ButtonGroup variant="outlined" size="small">
        {!isVideo && (
          <Button
            startIcon={<HighQualityIcon />}
            onClick={onToggleUpscale}
            disabled={isTogglingUpscale}
            sx={isUpscaleMarked ? UPSCALE_BUTTON_ACTIVE_SX : UPSCALE_BUTTON_SX}
          >
            {isTogglingUpscale ? <CircularProgress size={18} /> : "Upscale"}
          </Button>
        )}
        {!isVideo && hasAnimations && (
          <Button
            startIcon={<AnimationIcon />}
            endIcon={<ArrowDropDownIcon />}
            onClick={onOpenAnimateMenu}
            disabled={isTogglingAnimate}
            sx={animateAction ? ANIMATE_BUTTON_ACTIVE_SX : ANIMATE_BUTTON_SX}
          >
            {isTogglingAnimate ? <CircularProgress size={18} /> : animateActionLabel}
          </Button>
        )}
        {isVideo && (
          <Button
            startIcon={<HighQualityIcon />}
            onClick={onToggleUpscaleVideo}
            disabled={isTogglingUpscaleVideo}
            sx={isUpscaleVideoMarked ? UPSCALE_BUTTON_ACTIVE_SX : UPSCALE_BUTTON_SX}
          >
            {isTogglingUpscaleVideo ? <CircularProgress size={18} /> : "Upscale"}
          </Button>
        )}
        {isVideo && hasAnimations && (
          <Button
            startIcon={<AnimationIcon />}
            endIcon={<ArrowDropDownIcon />}
            onClick={onOpenExtendMenu}
            disabled={isTogglingExtend}
            sx={extendAction ? ANIMATE_BUTTON_ACTIVE_SX : ANIMATE_BUTTON_SX}
          >
            {isTogglingExtend ? <CircularProgress size={18} /> : extendActionLabel}
          </Button>
        )}
        {canEditAnimationPrompt && (
          <Button startIcon={<EditIcon />} onClick={onOpenEditPrompt} sx={EDIT_PROMPT_BUTTON_SX}>
            Edit Animation
          </Button>
        )}
        <Button
          startIcon={<DeleteIcon />}
          onClick={onDelete}
          disabled={isDeleting}
          sx={DELETE_BUTTON_SX}
        >
          {isDeleting ? <CircularProgress size={18} /> : deleteLabel}
        </Button>
      </ButtonGroup>
    </>
  );
}
