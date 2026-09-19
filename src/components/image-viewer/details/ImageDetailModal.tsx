"use client";

import AnimationIcon from "@mui/icons-material/Animation";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import HighQualityIcon from "@mui/icons-material/HighQuality";
import InfoIcon from "@mui/icons-material/Info";
import PhotoIcon from "@mui/icons-material/Photo";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IAnimationConfig, IImageItem } from "@/types/library";

import { formatStyleLabel, getImageUrl } from "@/components/image-viewer/common/utils";
import { LazyImage } from "@/components/image-viewer/image/LazyImage";

import { CAPTION_SX, META_TITLE_SX } from "../common/constants";
import { ImageDetailMetadata } from "./ImageDetailMetadata";

const DIALOG_SX = { "& .MuiDialog-paper": { height: "95vh", m: 1 } };
const DIALOG_CONTENT_SX = { p: 0, bgcolor: "#000", display: "flex", overflow: "hidden" };
const CONTENT_BOX_SX = { display: "flex", width: "100%", height: "100%", position: "relative" };
const CLOSE_BUTTON_SX = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 10,
  bgcolor: "rgba(0, 0, 0, 0.7)",
  color: "#fff",
  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.9)" },
};
const TOGGLE_BUTTON_SX = {
  position: "absolute",
  top: 8,
  left: 8,
  zIndex: 10,
  bgcolor: "rgba(0, 0, 0, 0.7)",
  color: "#fff",
  display: { xs: "flex", sm: "none" },
  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.9)" },
};
const NAV_BUTTON_BASE_SX = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 10,
  bgcolor: "rgba(0, 0, 0, 0.7)",
  color: "#fff",
  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.9)" },
  "&.Mui-disabled": { bgcolor: "rgba(0, 0, 0, 0.35)", color: "rgba(255,255,255,0.4)" },
};
const NAV_BUTTON_LEFT_SX = { ...NAV_BUTTON_BASE_SX, left: 8 };
const NAV_BUTTON_RIGHT_SX = { ...NAV_BUTTON_BASE_SX, right: 8 };
const IMAGE_CONTAINER_SX = {
  flex: 1,
  display: "flex",
  flexDirection: { xs: "column", sm: "row" },
  alignItems: "stretch",
  justifyContent: "center",
  overflow: "hidden",
};
const IMAGE_VIEW_SX = { flex: 1, width: "100%", minHeight: 0 };
const LAZY_IMAGE_SX = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const LAZY_IMAGE_IMG_SX = { objectFit: "contain" };
const VIDEO_SX = { width: "100%", height: "100%", objectFit: "contain" };
const SIDEBAR_SX = {
  width: 280,
  bgcolor: "#1e1e1e",
  color: "#fff",
  overflowY: "auto",
  p: 3,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const META_BODY_SX = { mt: 0.5, opacity: 0.8 };

const METADATA_LOADING_SX = { display: "flex", justifyContent: "center", pt: 1 };
const MOBILE_ACTIONS_SX = {
  display: { xs: "flex", sm: "none" },
  flexDirection: "column",
  width: "100%",
  p: 2,
  gap: 1,
  bgcolor: "#1e1e1e",
};
const SIDEBAR_ACTIONS_SX = {
  display: { xs: "none", sm: "flex" },
  flexDirection: "column",
  mt: 4,
};

const DIVIDER_SX = { borderColor: "rgba(255,255,255,0.1)" };
const SPINNER_SX = { color: "rgba(255,255,255,0.5)" };
const DELETE_BUTTON_SX = {
  borderColor: "rgba(255,255,255,0.3)",
  color: "#f44336",
  "&:hover": { borderColor: "#f44336", bgcolor: "rgba(244,67,54,0.08)" },
};
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
// Precomputed per-depth sx objects for the flattened animation menu's indentation, so the JSX
// below references a stable object rather than creating a new one on every render.
const MAX_PRECOMPUTED_ANIMATE_MENU_INDENT_DEPTH = 6;
const ANIMATE_MENU_ITEM_INDENT_SX_BY_DEPTH: readonly { pl: number }[] = Array.from(
  { length: MAX_PRECOMPUTED_ANIMATE_MENU_INDENT_DEPTH },
  (_, depth) => ({ pl: 2 + depth * 2 }),
);
const getAnimateMenuItemIndentSx = (depth: number): { pl: number } =>
  ANIMATE_MENU_ITEM_INDENT_SX_BY_DEPTH[depth] ?? { pl: 2 + depth * 2 };

interface IImageDetailModalProps {
  image: IImageItem | null;
  canDeleteImage?: boolean;
  onClose: () => void;
  onDeleteSuccess?: () => void;
  canNavigatePrevious?: boolean;
  canNavigateNext?: boolean;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  styleLabel?: (style: string) => string;
  animations?: IAnimationConfig[];
}

interface IFlatAnimationOption {
  key: string;
  name: string;
  depth: number;
}

interface IMetadataState {
  path: string | null;
  data: Record<string, string> | null;
}

interface IMarksState {
  path: string | null;
  upscale: boolean;
  animateAction: string | null;
  upscaleVideo: boolean;
  extendAction: string | null;
}

interface IMarksApiResponse {
  upscale?: boolean;
  animate?: { action: string } | null;
  upscaleVideo?: boolean;
  extend?: { action: string } | null;
}

interface IMobileViewState {
  path: string | null;
  view: "image" | "meta";
}

interface IVideoControlsState {
  path: string | null;
  shown: boolean;
}

// Small pure helpers factored out of the component body below purely to keep its own cognitive
// complexity down (each one-line ternary/&& here would otherwise count against the component).
const resolveMobileView = (
  state: IMobileViewState,
  relativePath: string | undefined,
): "image" | "meta" => (state.path === relativePath ? state.view : "image");

const resolveShowVideoControls = (
  state: IVideoControlsState,
  relativePath: string | undefined,
): boolean => state.path === relativePath && state.shown;

const resolveDeleteLabel = (isVideo: boolean): string =>
  isVideo ? "Delete video" : "Delete image";

const resolveIsLoadingMetadata = (
  image: IImageItem | null,
  isVideo: boolean,
  metadataState: IMetadataState,
  relativePath: string | undefined,
): boolean => Boolean(image) && !isVideo && metadataState.path !== relativePath;

const resolveMarksDerived = (
  marksState: IMarksState,
  relativePath: string | undefined,
): {
  isUpscaleMarked: boolean;
  animateAction: string | null;
  isUpscaleVideoMarked: boolean;
  extendAction: string | null;
} => {
  const isCurrentMarksState = marksState.path === relativePath;
  return {
    isUpscaleMarked: isCurrentMarksState && marksState.upscale,
    animateAction: isCurrentMarksState ? marksState.animateAction : null,
    isUpscaleVideoMarked: isCurrentMarksState && marksState.upscaleVideo,
    extendAction: isCurrentMarksState ? marksState.extendAction : null,
  };
};

// Mirrors src/lib/image-library.ts's findAnimationNodeByKey - duplicated (rather than imported)
// because that module pulls in node:fs and can't be bundled into a client component.
const findAnimationNodeByKey = (
  animations: IAnimationConfig[],
  key: string,
): IAnimationConfig | null => {
  for (const node of animations) {
    if (node.key === key) {
      return node;
    }

    const foundInSubVersions = node.subVersions
      ? findAnimationNodeByKey(node.subVersions, key)
      : null;
    if (foundInSubVersions) {
      return foundInSubVersions;
    }
  }

  return null;
};

// MUI has no built-in nested Menu, so a two-level animation config is flattened into a single
// list with depth-based indentation instead.
const flattenAnimations = (nodes: IAnimationConfig[], depth: number = 0): IFlatAnimationOption[] =>
  nodes.flatMap((node) => [
    { key: node.key, name: node.name, depth },
    ...(node.subVersions ? flattenAnimations(node.subVersions, depth + 1) : []),
  ]);

// Split out of ImageDetailModal's body so its own branches (error alerts, per-media-type button
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

function ImageDetailActions({
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

export function ImageDetailModal({
  image,
  canDeleteImage = false,
  onClose,
  onDeleteSuccess,
  canNavigatePrevious = false,
  canNavigateNext = false,
  onNavigatePrevious,
  onNavigateNext,
  styleLabel = formatStyleLabel,
  animations = [],
}: Readonly<IImageDetailModalProps>) {
  const [metadataState, setMetadataState] = useState<IMetadataState>({ path: null, data: null });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isRedrawing, setIsRedrawing] = useState(false);
  const [redrawError, setRedrawError] = useState<string | null>(null);
  const [marksState, setMarksState] = useState<IMarksState>({
    path: null,
    upscale: false,
    animateAction: null,
    upscaleVideo: false,
    extendAction: null,
  });
  const [isTogglingUpscale, setIsTogglingUpscale] = useState(false);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [isTogglingAnimate, setIsTogglingAnimate] = useState(false);
  const [animateError, setAnimateError] = useState<string | null>(null);
  const [animateMenuAnchorEl, setAnimateMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [isTogglingUpscaleVideo, setIsTogglingUpscaleVideo] = useState(false);
  const [upscaleVideoError, setUpscaleVideoError] = useState<string | null>(null);
  const [isTogglingExtend, setIsTogglingExtend] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [extendMenuAnchorEl, setExtendMenuAnchorEl] = useState<HTMLElement | null>(null);
  const touchStartXRef = useRef(0);

  const relativePath = image?.relativePath;

  const [mobileViewState, setMobileViewState] = useState<IMobileViewState>({
    path: null,
    view: "image",
  });
  const mobileView = resolveMobileView(mobileViewState, relativePath);

  const [videoControlsState, setVideoControlsState] = useState<IVideoControlsState>({
    path: null,
    shown: false,
  });
  const showVideoControls = resolveShowVideoControls(videoControlsState, relativePath);
  const handleVideoClick = useCallback(() => {
    setVideoControlsState({ path: relativePath ?? null, shown: true });
  }, [relativePath]);

  useEffect(() => {
    if (!image || isConfirmOpen || isDeleting) {
      return () => {};
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && canNavigatePrevious) {
        event.preventDefault();
        onNavigatePrevious?.();
      }

      if (event.key === "ArrowRight" && canNavigateNext) {
        event.preventDefault();
        onNavigateNext?.();
      }
    };

    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [
    image,
    canNavigatePrevious,
    canNavigateNext,
    onNavigatePrevious,
    onNavigateNext,
    isConfirmOpen,
    isDeleting,
  ]);

  const isVideo = image?.mediaType === "video";
  const deleteLabel = resolveDeleteLabel(isVideo);

  useEffect(() => {
    if (!relativePath || isVideo) {
      return () => {};
    }

    let isMounted = true;

    fetch(`/api/metadata?path=${encodeURIComponent(relativePath)}`)
      .then((res) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        res.ok ? (res.json() as Promise<Record<string, string>>) : Promise.resolve(null),
      )
      .then((data) => {
        if (isMounted) {
          setMetadataState({ path: relativePath, data });
        }
      })
      .catch(() => {
        if (isMounted) {
          setMetadataState({ path: relativePath, data: null });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [relativePath, isVideo]);

  useEffect(() => {
    if (!relativePath || !canDeleteImage) {
      return () => {};
    }

    let isMounted = true;
    const emptyMarksState: IMarksState = {
      path: relativePath,
      upscale: false,
      animateAction: null,
      upscaleVideo: false,
      extendAction: null,
    };

    fetch(`/api/marks?path=${encodeURIComponent(relativePath)}`)
      .then((res) =>
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        res.ok ? (res.json() as Promise<IMarksApiResponse>) : Promise.resolve(null),
      )
      .then((data) => {
        if (isMounted) {
          setMarksState({
            path: relativePath,
            upscale: data?.upscale ?? false,
            animateAction: data?.animate?.action ?? null,
            upscaleVideo: data?.upscaleVideo ?? false,
            extendAction: data?.extend?.action ?? null,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setMarksState(emptyMarksState);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [relativePath, canDeleteImage]);

  const isLoadingMetadata = resolveIsLoadingMetadata(image, isVideo, metadataState, relativePath);
  const pngMetadata = useMemo(
    () => (!isVideo && metadataState.path === relativePath ? metadataState.data : null),
    [metadataState, relativePath, isVideo],
  );

  const handleDeleteClick = useCallback(() => {
    setDeleteError(null);
    setIsConfirmOpen(true);
  }, []);

  const handleConfirmClose = useCallback(() => {
    setIsConfirmOpen(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!relativePath) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/image?path=${encodeURIComponent(relativePath)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setDeleteError("Could not delete the image. Try again.");
        setIsConfirmOpen(false);
        return;
      }

      setIsConfirmOpen(false);
      onDeleteSuccess?.();
    } catch {
      setDeleteError("Could not delete the image. Try again.");
      setIsConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [relativePath, onDeleteSuccess]);

  const handleRedrawClick = useCallback(async () => {
    if (!relativePath) {
      return;
    }

    setIsRedrawing(true);
    setRedrawError(null);

    try {
      const response = await fetch(`/api/image?path=${encodeURIComponent(relativePath)}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        setRedrawError("Could not rename the image. Try again.");
        return;
      }

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      (await response.json()) as { newPath: string };
      onDeleteSuccess?.();
    } catch {
      setRedrawError("Could not rename the image. Try again.");
    } finally {
      setIsRedrawing(false);
    }
  }, [relativePath, onDeleteSuccess]);

  const { isUpscaleMarked, animateAction, isUpscaleVideoMarked, extendAction } =
    resolveMarksDerived(marksState, relativePath);
  const rawMetadata = pngMetadata?.parameters ?? "";
  const flatAnimationOptions = useMemo(() => flattenAnimations(animations), [animations]);
  const animateActionLabel = animateAction
    ? (findAnimationNodeByKey(animations, animateAction)?.name ?? animateAction)
    : "Animate";
  const extendActionLabel = extendAction
    ? (findAnimationNodeByKey(animations, extendAction)?.name ?? extendAction)
    : "Extend";

  const handleToggleUpscale = useCallback(async () => {
    if (!relativePath) {
      return;
    }

    setIsTogglingUpscale(true);
    setUpscaleError(null);

    try {
      const nextUpscale = !isUpscaleMarked;
      const response = nextUpscale
        ? await fetch("/api/marks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: relativePath, type: "upscale", metadata: rawMetadata }),
          })
        : await fetch(`/api/marks?path=${encodeURIComponent(relativePath)}&type=upscale`, {
            method: "DELETE",
          });

      if (!response.ok) {
        setUpscaleError("Could not update the upscale mark. Try again.");
        return;
      }

      // Merge into whatever the latest state is (functional update) rather than reconstructing
      // it from values captured when this handler started, so a concurrent animate mark that
      // resolved in the meantime isn't clobbered. Drop the response outright if the user has
      // since navigated to a different image.
      setMarksState((prev) =>
        prev.path === relativePath ? { ...prev, upscale: nextUpscale } : prev,
      );
    } catch {
      setUpscaleError("Could not update the upscale mark. Try again.");
    } finally {
      setIsTogglingUpscale(false);
    }
  }, [relativePath, isUpscaleMarked, rawMetadata]);

  const handleOpenAnimateMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnimateMenuAnchorEl(event.currentTarget);
  }, []);

  const handleCloseAnimateMenu = useCallback(() => {
    setAnimateMenuAnchorEl(null);
  }, []);

  const handleSelectAnimateAction = useCallback(
    async (action: string) => {
      setAnimateMenuAnchorEl(null);

      if (!relativePath) {
        return;
      }

      setIsTogglingAnimate(true);
      setAnimateError(null);

      try {
        const isRemoving = animateAction === action;
        const response = isRemoving
          ? await fetch(`/api/marks?path=${encodeURIComponent(relativePath)}&type=animate`, {
              method: "DELETE",
            })
          : await fetch("/api/marks", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: relativePath,
                type: "animate",
                action,
                metadata: rawMetadata,
              }),
            });

        if (!response.ok) {
          setAnimateError("Could not update the animate mark. Try again.");
          return;
        }

        // See the matching comment in handleToggleUpscale: merge via functional update so a
        // concurrent upscale toggle isn't clobbered, and drop the response if the user has
        // since navigated to a different image.
        setMarksState((prev) =>
          prev.path === relativePath
            ? { ...prev, animateAction: isRemoving ? null : action }
            : prev,
        );
      } catch {
        setAnimateError("Could not update the animate mark. Try again.");
      } finally {
        setIsTogglingAnimate(false);
      }
    },
    [relativePath, animateAction, rawMetadata],
  );

  const handleAnimateMenuItemClick = useCallback(
    (event: React.MouseEvent<HTMLLIElement>) => {
      const action = event.currentTarget.dataset.action;
      if (action) {
        void handleSelectAnimateAction(action);
      }
    },
    [handleSelectAnimateAction],
  );

  const handleToggleUpscaleVideo = useCallback(async () => {
    if (!relativePath) {
      return;
    }

    setIsTogglingUpscaleVideo(true);
    setUpscaleVideoError(null);

    try {
      const nextUpscaleVideo = !isUpscaleVideoMarked;
      const response = nextUpscaleVideo
        ? await fetch("/api/marks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: relativePath, type: "upscaleVideo" }),
          })
        : await fetch(`/api/marks?path=${encodeURIComponent(relativePath)}&type=upscaleVideo`, {
            method: "DELETE",
          });

      if (!response.ok) {
        setUpscaleVideoError("Could not update the upscale mark. Try again.");
        return;
      }

      setMarksState((prev) =>
        prev.path === relativePath ? { ...prev, upscaleVideo: nextUpscaleVideo } : prev,
      );
    } catch {
      setUpscaleVideoError("Could not update the upscale mark. Try again.");
    } finally {
      setIsTogglingUpscaleVideo(false);
    }
  }, [relativePath, isUpscaleVideoMarked]);

  const handleOpenExtendMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setExtendMenuAnchorEl(event.currentTarget);
  }, []);

  const handleCloseExtendMenu = useCallback(() => {
    setExtendMenuAnchorEl(null);
  }, []);

  const handleSelectExtendAction = useCallback(
    async (action: string) => {
      setExtendMenuAnchorEl(null);

      if (!relativePath) {
        return;
      }

      setIsTogglingExtend(true);
      setExtendError(null);

      try {
        const isRemoving = extendAction === action;
        const response = isRemoving
          ? await fetch(`/api/marks?path=${encodeURIComponent(relativePath)}&type=extend`, {
              method: "DELETE",
            })
          : await fetch("/api/marks", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: relativePath, type: "extend", action }),
            });

        if (!response.ok) {
          setExtendError("Could not update the extend mark. Try again.");
          return;
        }

        setMarksState((prev) =>
          prev.path === relativePath ? { ...prev, extendAction: isRemoving ? null : action } : prev,
        );
      } catch {
        setExtendError("Could not update the extend mark. Try again.");
      } finally {
        setIsTogglingExtend(false);
      }
    },
    [relativePath, extendAction],
  );

  const handleExtendMenuItemClick = useCallback(
    (event: React.MouseEvent<HTMLLIElement>) => {
      const action = event.currentTarget.dataset.action;
      if (action) {
        void handleSelectExtendAction(action);
      }
    },
    [handleSelectExtendAction],
  );

  const handleToggleMobileView = useCallback(() => {
    setMobileViewState((prev) => ({
      path: relativePath ?? null,
      view: prev.path === relativePath && prev.view === "image" ? "meta" : "image",
    }));
  }, [relativePath]);

  const imageContainerSx = useMemo(
    () => ({
      ...IMAGE_CONTAINER_SX,
      display: { xs: mobileView === "image" ? "flex" : "none", sm: "flex" },
    }),
    [mobileView],
  );

  const sidebarSx = useMemo(
    () => ({
      ...SIDEBAR_SX,
      display: { xs: mobileView === "meta" ? "flex" : "none", sm: "flex" },
      minWidth: { xs: "100%", sm: 280 },
      maxWidth: { xs: "100%", sm: "30%" },
      width: "100%",
    }),
    [mobileView],
  );

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartXRef.current = event.changedTouches[0]?.clientX ?? 0;
  }, []);

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const touchEndX = event.changedTouches[0]?.clientX ?? 0;
      const swipeDistance = touchEndX - touchStartXRef.current;

      if (Math.abs(swipeDistance) < 40) {
        return;
      }

      if (swipeDistance < 0 && canNavigateNext) {
        onNavigateNext?.();
        return;
      }

      if (swipeDistance > 0 && canNavigatePrevious) {
        onNavigatePrevious?.();
      }
    },
    [canNavigateNext, canNavigatePrevious, onNavigateNext, onNavigatePrevious],
  );

  const imageActions = (
    <ImageDetailActions
      deleteError={deleteError}
      redrawError={redrawError}
      upscaleError={upscaleError}
      animateError={animateError}
      upscaleVideoError={upscaleVideoError}
      extendError={extendError}
      isVideo={isVideo}
      hasAnimations={animations.length > 0}
      isRedrawing={isRedrawing}
      onRedraw={handleRedrawClick}
      isTogglingUpscale={isTogglingUpscale}
      isUpscaleMarked={isUpscaleMarked}
      onToggleUpscale={handleToggleUpscale}
      isTogglingAnimate={isTogglingAnimate}
      animateAction={animateAction}
      animateActionLabel={animateActionLabel}
      onOpenAnimateMenu={handleOpenAnimateMenu}
      isTogglingUpscaleVideo={isTogglingUpscaleVideo}
      isUpscaleVideoMarked={isUpscaleVideoMarked}
      onToggleUpscaleVideo={handleToggleUpscaleVideo}
      isTogglingExtend={isTogglingExtend}
      extendAction={extendAction}
      extendActionLabel={extendActionLabel}
      onOpenExtendMenu={handleOpenExtendMenu}
      isDeleting={isDeleting}
      deleteLabel={deleteLabel}
      onDelete={handleDeleteClick}
    />
  );

  if (!image) {
    return null;
  }

  return (
    <>
      <Dialog open={Boolean(image)} onClose={onClose} maxWidth={false} fullWidth sx={DIALOG_SX}>
        <DialogContent sx={DIALOG_CONTENT_SX}>
          <Box sx={CONTENT_BOX_SX}>
            {/* Close button */}
            <IconButton onClick={onClose} sx={CLOSE_BUTTON_SX}>
              <CloseIcon />
            </IconButton>

            {/* Mobile view toggle */}
            <IconButton onClick={handleToggleMobileView} sx={TOGGLE_BUTTON_SX}>
              {mobileView === "image" ? <InfoIcon /> : <PhotoIcon />}
            </IconButton>

            <IconButton
              aria-label="Previous image"
              onClick={onNavigatePrevious}
              disabled={!canNavigatePrevious}
              sx={NAV_BUTTON_LEFT_SX}
            >
              <ChevronLeftIcon />
            </IconButton>

            <IconButton
              aria-label="Next image"
              onClick={onNavigateNext}
              disabled={!canNavigateNext}
              sx={NAV_BUTTON_RIGHT_SX}
            >
              <ChevronRightIcon />
            </IconButton>

            {/* Image */}
            <Box sx={imageContainerSx} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              <Box sx={IMAGE_VIEW_SX}>
                {isVideo ? (
                  <Box
                    component="video"
                    src={getImageUrl(image.relativePath)}
                    controls={showVideoControls}
                    onClick={handleVideoClick}
                    preload="metadata"
                    sx={VIDEO_SX}
                  />
                ) : (
                  <LazyImage
                    relativePath={image.relativePath}
                    alt={`${image.characterName} ${image.poseName}`}
                    sx={LAZY_IMAGE_SX}
                    modifiedAt={image.modifiedAt}
                    imgSx={LAZY_IMAGE_IMG_SX}
                    mode="magnifier"
                  />
                )}
              </Box>
              {canDeleteImage && <Box sx={MOBILE_ACTIONS_SX}>{imageActions}</Box>}
            </Box>

            {/* Metadata sidebar */}
            <Box sx={sidebarSx}>
              {canDeleteImage && (
                <Box sx={SIDEBAR_ACTIONS_SX}>
                  {imageActions}
                  <Divider sx={DIVIDER_SX} />
                </Box>
              )}

              <Box>
                <Typography variant="caption" sx={CAPTION_SX}>
                  Character
                </Typography>
                <Typography variant="h6" sx={META_TITLE_SX}>
                  {image.characterName}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={CAPTION_SX}>
                  Style
                </Typography>
                <Typography variant="h6" sx={META_TITLE_SX}>
                  {styleLabel(image.style)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" sx={CAPTION_SX}>
                  Pose
                </Typography>
                <Typography variant="h6" sx={META_TITLE_SX}>
                  {image.poseName}
                </Typography>
              </Box>

              {(isLoadingMetadata || pngMetadata) && <Divider sx={DIVIDER_SX} />}

              {isLoadingMetadata && (
                <Box sx={METADATA_LOADING_SX}>
                  <CircularProgress size={20} sx={SPINNER_SX} />
                </Box>
              )}

              {pngMetadata &&
                Object.entries(pngMetadata).map(([key, value]) =>
                  key === "parameters" ? (
                    <ImageDetailMetadata key={key} pngMetadata={value} />
                  ) : (
                    <Box key={key}>
                      <Typography variant="caption" sx={CAPTION_SX}>
                        {key}
                      </Typography>
                      <Typography variant="body2" sx={META_BODY_SX}>
                        {value}
                      </Typography>
                    </Box>
                  ),
                )}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      <Menu
        anchorEl={animateMenuAnchorEl}
        open={Boolean(animateMenuAnchorEl)}
        onClose={handleCloseAnimateMenu}
      >
        {flatAnimationOptions.map((option) => (
          <MenuItem
            key={option.key}
            data-action={option.key}
            selected={animateAction === option.key}
            onClick={handleAnimateMenuItemClick}
            sx={getAnimateMenuItemIndentSx(option.depth)}
          >
            {option.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={extendMenuAnchorEl}
        open={Boolean(extendMenuAnchorEl)}
        onClose={handleCloseExtendMenu}
      >
        {flatAnimationOptions.map((option) => (
          <MenuItem
            key={option.key}
            data-action={option.key}
            selected={extendAction === option.key}
            onClick={handleExtendMenuItemClick}
            sx={getAnimateMenuItemIndentSx(option.depth)}
          >
            {option.name}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={isConfirmOpen} onClose={handleConfirmClose}>
        <DialogTitle>{isVideo ? "Delete video?" : "Delete image?"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete{" "}
            <strong>{getImageUrl(image.relativePath).split("/").pop()}</strong> for{" "}
            <strong>{image.characterName}</strong>. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button onClick={handleConfirmDelete} color="error" disabled={isDeleting}>
            {isDeleting ? <CircularProgress size={18} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
