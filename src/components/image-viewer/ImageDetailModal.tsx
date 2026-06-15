"use client";

import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import InfoIcon from "@mui/icons-material/Info";
import PhotoIcon from "@mui/icons-material/Photo";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IImageItem, TStyle } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";
import { formatStyleLabel, getImageUrl } from "@/components/image-viewer/utils";
import { ImageDetailMetadata } from "./ImageDetailMetadata";
import { CAPTION_SX, META_TITLE_SX } from "./constants";

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
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};
const LAZY_IMAGE_SX = { width: "100%", height: "100%" };
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

const DIVIDER_SX = { borderColor: "rgba(255,255,255,0.1)" };
const SPINNER_SX = { color: "rgba(255,255,255,0.5)" };
const DELETE_BUTTON_SX = {
  mt: "auto",
  borderColor: "rgba(255,255,255,0.3)",
  color: "#f44336",
  "&:hover": { borderColor: "#f44336", bgcolor: "rgba(244,67,54,0.08)" },
};
const DELETE_ERROR_SX = { fontSize: "0.75rem" };

interface IImageDetailModalProps {
  image: IImageItem | null;
  canDeleteImage?: boolean;
  onClose: () => void;
  onDeleteSuccess?: () => void;
  canNavigatePrevious?: boolean;
  canNavigateNext?: boolean;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  styleLabel?: (style: TStyle) => string;
}

interface IMetadataState {
  path: string | null;
  data: Record<string, string> | null;
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
}: Readonly<IImageDetailModalProps>) {
  const [metadataState, setMetadataState] = useState<IMetadataState>({ path: null, data: null });
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const touchStartXRef = useRef(0);

  const relativePath = image?.relativePath;

  const [mobileViewState, setMobileViewState] = useState<{
    path: string | null;
    view: "image" | "meta";
  }>({ path: null, view: "image" });
  const mobileView = mobileViewState.path === relativePath ? mobileViewState.view : "image";

  useEffect(() => {
    if (!image) {
      return;
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
  }, [image, canNavigatePrevious, canNavigateNext, onNavigatePrevious, onNavigateNext]);

  useEffect(() => {
    if (!relativePath) return;

    let isMounted = true;

    fetch(`/api/metadata?path=${encodeURIComponent(relativePath)}`)
      .then((res) =>
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

  const handleDeleteClick = useCallback(() => {
    setDeleteError(null);
    setIsConfirmOpen(true);
  }, []);

  const handleConfirmClose = useCallback(() => {
    setIsConfirmOpen(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!relativePath) return;

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
      width: { xs: "100%", sm: 280 },
    }),
    [mobileView],
  );

  const isLoadingMetadata = Boolean(image) && metadataState.path !== relativePath;
  const pngMetadata = useMemo(
    () => (metadataState.path === relativePath ? metadataState.data : null),
    [metadataState, relativePath],
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

  if (!image) {
    return null;
  }

  return (
    <>
      <Dialog open={Boolean(image)} onClose={onClose} maxWidth="xl" fullWidth sx={DIALOG_SX}>
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
              <LazyImage
                relativePath={image.relativePath}
                alt={`${image.characterName} ${image.poseName}`}
                sx={LAZY_IMAGE_SX}
                imgSx={LAZY_IMAGE_IMG_SX}
              />
            </Box>

            {/* Metadata sidebar */}
            <Box sx={sidebarSx}>
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

              {canDeleteImage && (
                <>
                  <Divider sx={DIVIDER_SX} />
                  {deleteError && (
                    <Alert severity="error" sx={DELETE_ERROR_SX}>
                      {deleteError}
                    </Alert>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteClick}
                    sx={DELETE_BUTTON_SX}
                  >
                    Delete image
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

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
          <Button onClick={handleConfirmDelete} color="error" disabled={isDeleting} autoFocus>
            {isDeleting ? <CircularProgress size={18} /> : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
