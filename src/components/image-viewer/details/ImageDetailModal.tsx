"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import InfoIcon from "@mui/icons-material/Info";
import PhotoIcon from "@mui/icons-material/Photo";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IAnimationConfig, IImageItem, IVideoLink } from "@/types/library";

import { formatStyleLabel, getImageUrl } from "@/components/image-viewer/common/utils";
import { LazyImage } from "@/components/image-viewer/image/LazyImage";

import { CAPTION_SX, META_TITLE_SX } from "../common/constants";
import { ImageDetailActions } from "./ImageDetailActions";
import { ImageDetailDeleteDialog } from "./ImageDetailDeleteDialog";
import { ImageDetailEditPromptDialog } from "./ImageDetailEditPromptDialog";
import { ImageDetailMetadata } from "./ImageDetailMetadata";

// Stable reference for the `animations` default prop - an inline `[]` literal would be
// re-created on every render, breaking referential equality for anything memoized off it.
const EMPTY_ANIMATIONS: IAnimationConfig[] = [];

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
  onImageSeen?: (relativePath: string) => void;
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
  animatePrompt: string | null;
  upscaleVideo: boolean;
  extendAction: string | null;
  extendPrompt: string | null;
  videoLink: IVideoLink | null;
}

interface IMarksApiResponse {
  upscale?: boolean;
  animate?: { action: string; prompt: string } | null;
  upscaleVideo?: boolean;
  extend?: { action: string; prompt: string } | null;
  link?: IVideoLink | null;
}

interface IMobileViewState {
  path: string | null;
  view: "image" | "meta";
}

interface IVideoControlsState {
  path: string | null;
  shown: boolean;
}

interface IEditPromptState {
  path: string | null;
  open: boolean;
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

// Navigating to a different image (prev/next buttons, swipe, or arrow keys) must never leave a
// stale prompt draft armed for the newly selected image - keying this open/closed state by path
// (rather than a plain boolean) closes it for free on navigation, the same way IMobileViewState/
// IVideoControlsState above already reset their own per-image state without an effect.
const resolveIsEditPromptOpen = (
  state: IEditPromptState,
  relativePath: string | undefined,
): boolean => state.path === relativePath && state.open;

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
  animatePrompt: string | null;
  isUpscaleVideoMarked: boolean;
  extendAction: string | null;
  extendPrompt: string | null;
  videoLink: IVideoLink | null;
} => {
  const isCurrentMarksState = marksState.path === relativePath;
  return {
    isUpscaleMarked: isCurrentMarksState && marksState.upscale,
    animateAction: isCurrentMarksState ? marksState.animateAction : null,
    animatePrompt: isCurrentMarksState ? marksState.animatePrompt : null,
    isUpscaleVideoMarked: isCurrentMarksState && marksState.upscaleVideo,
    extendAction: isCurrentMarksState ? marksState.extendAction : null,
    extendPrompt: isCurrentMarksState ? marksState.extendPrompt : null,
    videoLink: isCurrentMarksState ? marksState.videoLink : null,
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

// "Came from X" resolves the source's filename (not a full pose-name parse - link.
// sourceRelativePath already points at a real file, so its own basename is the pose it shows)
// and the action's display name, e.g. "Extended from Base (Dance)". A null link (reconciliation
// hasn't matched this video to a source yet, or never will) renders nothing - not an error state.
const resolveCameFromLabel = (
  videoLink: IVideoLink | null,
  animations: IAnimationConfig[],
): string | null => {
  if (!videoLink) {
    return null;
  }

  const sourceFileName =
    videoLink.sourceRelativePath.split("/").pop() ?? videoLink.sourceRelativePath;
  const sourceLabel = sourceFileName.replace(/\.(png|mp4)$/i, "");
  const actionLabel =
    findAnimationNodeByKey(animations, videoLink.action)?.name ?? videoLink.action;

  return `Extended from ${sourceLabel} (${actionLabel})`;
};

// MUI has no built-in nested Menu, so a two-level animation config is flattened into a single
// list with depth-based indentation instead.
const flattenAnimations = (nodes: IAnimationConfig[], depth: number = 0): IFlatAnimationOption[] =>
  nodes.flatMap((node) => [
    { key: node.key, name: node.name, depth },
    ...(node.subVersions ? flattenAnimations(node.subVersions, depth + 1) : []),
  ]);

export function ImageDetailModal({
  image,
  canDeleteImage = false,
  onClose,
  onDeleteSuccess,
  onImageSeen,
  canNavigatePrevious = false,
  canNavigateNext = false,
  onNavigatePrevious,
  onNavigateNext,
  styleLabel = formatStyleLabel,
  animations = EMPTY_ANIMATIONS,
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
    animatePrompt: null,
    upscaleVideo: false,
    extendAction: null,
    extendPrompt: null,
    videoLink: null,
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
  const [editPromptState, setEditPromptState] = useState<IEditPromptState>({
    path: null,
    open: false,
  });
  const [editPromptDraft, setEditPromptDraft] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [editPromptError, setEditPromptError] = useState<string | null>(null);
  const touchStartXRef = useRef(0);

  const relativePath = image?.relativePath;
  const isEditPromptOpen = resolveIsEditPromptOpen(editPromptState, relativePath);

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

  // Opening Details on a new image/video dismisses its "new" badge and drops it from the "show
  // new only" filter right away, rather than waiting out the server-side new-image time window -
  // mirrors the optimistic-then-persisted pattern the mark toggles below use.
  useEffect(() => {
    if (!relativePath || !image?.isNew) {
      return () => {};
    }

    onImageSeen?.(relativePath);
    fetch(`/api/image/seen?path=${encodeURIComponent(relativePath)}`, { method: "POST" }).catch(
      () => {},
    );

    return () => {};
  }, [relativePath, image?.isNew, onImageSeen]);

  useEffect(() => {
    if (!image || isConfirmOpen || isDeleting || isEditPromptOpen) {
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
    isEditPromptOpen,
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
    // The upscale/animate/extend mark state this fetch also carries is only ever rendered
    // inside imageActions, itself gated on canDeleteImage - but a video's provenance link
    // (the "Came From" block) is plain informational display, shown to every viewer regardless
    // of delete permission. Skipping this fetch outright for a read-only video would silently
    // suppress that block for the vast majority of viewers (SD_ALLOW_DELETE defaults off).
    if (!relativePath || (!canDeleteImage && !isVideo)) {
      return () => {};
    }

    let isMounted = true;
    const emptyMarksState: IMarksState = {
      path: relativePath,
      upscale: false,
      animateAction: null,
      animatePrompt: null,
      upscaleVideo: false,
      extendAction: null,
      extendPrompt: null,
      videoLink: null,
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
            animatePrompt: data?.animate?.prompt ?? null,
            upscaleVideo: data?.upscaleVideo ?? false,
            extendAction: data?.extend?.action ?? null,
            extendPrompt: data?.extend?.prompt ?? null,
            videoLink: data?.link ?? null,
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
  }, [relativePath, canDeleteImage, isVideo]);

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

  const {
    isUpscaleMarked,
    animateAction,
    animatePrompt,
    isUpscaleVideoMarked,
    extendAction,
    extendPrompt,
    videoLink,
  } = resolveMarksDerived(marksState, relativePath);
  const rawMetadata = pngMetadata?.parameters ?? "";
  const flatAnimationOptions = useMemo(() => flattenAnimations(animations), [animations]);
  const animateActionLabel = animateAction
    ? (findAnimationNodeByKey(animations, animateAction)?.name ?? animateAction)
    : "Animate";
  const extendActionLabel = extendAction
    ? (findAnimationNodeByKey(animations, extendAction)?.name ?? extendAction)
    : "Extend";
  const cameFromLabel = resolveCameFromLabel(videoLink, animations);

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
        // since navigated to a different image. A freshly-created mark's prompt mirrors the
        // server's own default-seed logic (the resolved node's configured prompt), so Edit
        // Animation doesn't open on a stale empty draft before the next GET round-trip.
        setMarksState((prev) =>
          prev.path === relativePath
            ? {
                ...prev,
                animateAction: isRemoving ? null : action,
                animatePrompt: isRemoving
                  ? null
                  : (findAnimationNodeByKey(animations, action)?.prompt ?? ""),
              }
            : prev,
        );
      } catch {
        setAnimateError("Could not update the animate mark. Try again.");
      } finally {
        setIsTogglingAnimate(false);
      }
    },
    [relativePath, animateAction, rawMetadata, animations],
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
          prev.path === relativePath
            ? {
                ...prev,
                extendAction: isRemoving ? null : action,
                extendPrompt: isRemoving
                  ? null
                  : (findAnimationNodeByKey(animations, action)?.prompt ?? ""),
              }
            : prev,
        );
      } catch {
        setExtendError("Could not update the extend mark. Try again.");
      } finally {
        setIsTogglingExtend(false);
      }
    },
    [relativePath, extendAction, animations],
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

  // "Edit Animation" edits whichever mark is currently active for this media type (extend for a
  // video, animate for an image) - there's only ever one at a time per image/video.
  const currentAnimationAction = isVideo ? extendAction : animateAction;
  const currentAnimationPrompt = isVideo ? extendPrompt : animatePrompt;
  // An orphaned mark (its action key removed from config since it was created) still shows its
  // Animate/Extend button, but editing it would only fail server-side (the PUT re-validates the
  // key), so the Edit Animation button is hidden rather than offering an edit that can't save.
  const canEditAnimationPrompt =
    currentAnimationAction !== null &&
    findAnimationNodeByKey(animations, currentAnimationAction) !== null;

  const handleOpenEditPrompt = useCallback(() => {
    setEditPromptError(null);
    setEditPromptDraft(currentAnimationPrompt ?? "");
    setEditPromptState({ path: relativePath ?? null, open: true });
  }, [currentAnimationPrompt, relativePath]);

  const handleCloseEditPrompt = useCallback(() => {
    setEditPromptState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSaveEditPrompt = useCallback(async () => {
    if (!relativePath || !currentAnimationAction) {
      return;
    }

    setIsSavingPrompt(true);
    setEditPromptError(null);

    try {
      // Reuses the same PUT upsert as the initial mark-creation flow, now carrying an explicit
      // prompt - the server never seeds it from config when one is sent. Edit Animation only ever
      // edits the prompt, so metadata is deliberately omitted here (for both media types): the
      // server preserves whatever the mark already has rather than trusting a value that may
      // still be "" if the PNG-metadata fetch hasn't resolved yet (or failed).
      const response = await fetch("/api/marks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: relativePath,
          type: isVideo ? "extend" : "animate",
          action: currentAnimationAction,
          prompt: editPromptDraft,
        }),
      });

      if (!response.ok) {
        setEditPromptError("Could not save the prompt. Try again.");
        return;
      }

      setMarksState((prev) => {
        if (prev.path !== relativePath) {
          return prev;
        }
        return isVideo
          ? { ...prev, extendPrompt: editPromptDraft }
          : { ...prev, animatePrompt: editPromptDraft };
      });
      setEditPromptState((prev) => (prev.path === relativePath ? { ...prev, open: false } : prev));
    } catch {
      setEditPromptError("Could not save the prompt. Try again.");
    } finally {
      setIsSavingPrompt(false);
    }
  }, [relativePath, currentAnimationAction, isVideo, editPromptDraft]);

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
      canEditAnimationPrompt={canEditAnimationPrompt}
      onOpenEditPrompt={handleOpenEditPrompt}
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

              {cameFromLabel && (
                <Box>
                  <Typography variant="caption" sx={CAPTION_SX}>
                    Came From
                  </Typography>
                  <Typography variant="body2" sx={META_BODY_SX}>
                    {cameFromLabel}
                  </Typography>
                </Box>
              )}

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

      <ImageDetailDeleteDialog
        open={isConfirmOpen}
        isVideo={isVideo}
        fileName={image.relativePath.split("/").pop() ?? ""}
        characterName={image.characterName}
        isDeleting={isDeleting}
        onClose={handleConfirmClose}
        onConfirm={handleConfirmDelete}
      />

      <ImageDetailEditPromptDialog
        open={isEditPromptOpen}
        error={editPromptError}
        draft={editPromptDraft}
        isSaving={isSavingPrompt}
        onDraftChange={setEditPromptDraft}
        onClose={handleCloseEditPrompt}
        onSave={handleSaveEditPrompt}
      />
    </>
  );
}
