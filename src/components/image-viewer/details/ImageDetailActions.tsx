"use client";

import AnimationIcon from "@mui/icons-material/Animation";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DeleteIcon from "@mui/icons-material/Delete";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Alert, Button, ButtonGroup, CircularProgress } from "@mui/material";

const DELETE_ERROR_SX = { fontSize: "0.75rem" };
const REDRAW_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#2196f3",
  "&:hover": { borderColor: "#2196f3", bgcolor: "rgba(33,150,243,0.08)" },
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
  isDeleting,
  deleteLabel,
  onDelete,
}: Readonly<IImageDetailActionsProps>) {
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
      <ButtonGroup variant="outlined" size="small">
        <Button
          startIcon={<RefreshIcon />}
          onClick={onRedraw}
          disabled={isRedrawing}
          sx={REDRAW_BUTTON_SX}
        >
          {isRedrawing ? <CircularProgress size={18} /> : "Redraw"}
        </Button>
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
