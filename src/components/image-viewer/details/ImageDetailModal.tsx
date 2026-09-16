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

import type { IImageItem } from "@/types/library";

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
  animations?: string[];
}

interface IMetadataState {
  path: string | null;
  data: Record<string, string> | null;
}

interface IMarksState {
  path: string | null;
  upscale: boolean;
  animateAction: string | null;
}

interface IMarksApiResponse {
  upscale: boolean;
  animate: { action: string } | null;
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
  });
  const [isTogglingUpscale, setIsTogglingUpscale] = useState(false);
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [isTogglingAnimate, setIsTogglingAnimate] = useState(false);
  const [animateError, setAnimateError] = useState<string | null>(null);
  const [animateMenuAnchorEl, setAnimateMenuAnchorEl] = useState<HTMLElement | null>(null);
  const touchStartXRef = useRef(0);

  const relativePath = image?.relativePath;

  const [mobileViewState, setMobileViewState] = useState<{
    path: string | null;
    view: "image" | "meta";
  }>({ path: null, view: "image" });
  const mobileView = mobileViewState.path === relativePath ? mobileViewState.view : "image";

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

  useEffect(() => {
    if (!relativePath) {
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
  }, [relativePath]);

  useEffect(() => {
    if (!relativePath || !canDeleteImage) {
      return () => {};
    }

    let isMounted = true;

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
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setMarksState({ path: relativePath, upscale: false, animateAction: null });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [relativePath, canDeleteImage]);

  const isLoadingMetadata = Boolean(image) && metadataState.path !== relativePath;
  const pngMetadata = useMemo(
    () => (metadataState.path === relativePath ? metadataState.data : null),
    [metadataState, relativePath],
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

  const isCurrentMarksState = marksState.path === relativePath;
  const isUpscaleMarked = isCurrentMarksState && marksState.upscale;
  const animateAction = isCurrentMarksState ? marksState.animateAction : null;
  const rawMetadata = pngMetadata?.parameters ?? "";

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
      <ButtonGroup variant="outlined" size="small">
        <Button
          startIcon={<RefreshIcon />}
          onClick={handleRedrawClick}
          disabled={isRedrawing}
          sx={REDRAW_BUTTON_SX}
        >
          {isRedrawing ? <CircularProgress size={18} /> : "Redraw"}
        </Button>
        <Button
          startIcon={<HighQualityIcon />}
          onClick={handleToggleUpscale}
          disabled={isTogglingUpscale}
          sx={isUpscaleMarked ? UPSCALE_BUTTON_ACTIVE_SX : UPSCALE_BUTTON_SX}
        >
          {isTogglingUpscale ? <CircularProgress size={18} /> : "Upscale"}
        </Button>
        {animations.length > 0 && (
          <Button
            startIcon={<AnimationIcon />}
            endIcon={<ArrowDropDownIcon />}
            onClick={handleOpenAnimateMenu}
            disabled={isTogglingAnimate}
            sx={animateAction ? ANIMATE_BUTTON_ACTIVE_SX : ANIMATE_BUTTON_SX}
          >
            {isTogglingAnimate ? <CircularProgress size={18} /> : (animateAction ?? "Animate")}
          </Button>
        )}
        <Button
          startIcon={<DeleteIcon />}
          onClick={handleDeleteClick}
          disabled={isDeleting}
          sx={DELETE_BUTTON_SX}
        >
          {isDeleting ? <CircularProgress size={18} /> : "Delete image"}
        </Button>
      </ButtonGroup>
    </>
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
                <LazyImage
                  relativePath={image.relativePath}
                  alt={`${image.characterName} ${image.poseName}`}
                  sx={LAZY_IMAGE_SX}
                  modifiedAt={image.modifiedAt}
                  imgSx={LAZY_IMAGE_IMG_SX}
                  mode="magnifier"
                />
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
        {animations.map((animationName) => (
          <MenuItem
            key={animationName}
            data-action={animationName}
            selected={animateAction === animationName}
            onClick={handleAnimateMenuItemClick}
          >
            {animationName}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={isConfirmOpen} onClose={handleConfirmClose}>
        <DialogTitle>Delete image?</DialogTitle>
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
