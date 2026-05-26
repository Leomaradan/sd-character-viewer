"use client";

import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { IImageItem, TStyle } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";
import { formatStyleLabel } from "@/components/image-viewer/utils";
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

interface IImageDetailModalProps {
  image: IImageItem | null;
  onClose: () => void;
  styleLabel?: (style: TStyle) => string;
}

interface IMetadataState {
  path: string | null;
  data: Record<string, string> | null;
}

export function ImageDetailModal({
  image,
  onClose,
  styleLabel = formatStyleLabel,
}: Readonly<IImageDetailModalProps>) {
  const [metadataState, setMetadataState] = useState<IMetadataState>({ path: null, data: null });

  const relativePath = image?.relativePath;

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

  const isLoadingMetadata = Boolean(image) && metadataState.path !== relativePath;
  const pngMetadata = useMemo(
    () => (metadataState.path === relativePath ? metadataState.data : null),
    [metadataState, relativePath],
  );

  if (!image) {
    return null;
  }

  return (
    <Dialog open={Boolean(image)} onClose={onClose} maxWidth="xl" fullWidth sx={DIALOG_SX}>
      <DialogContent sx={DIALOG_CONTENT_SX}>
        <Box sx={CONTENT_BOX_SX}>
          {/* Close button */}
          <IconButton onClick={onClose} sx={CLOSE_BUTTON_SX}>
            <CloseIcon />
          </IconButton>

          {/* Image */}
          <Box sx={IMAGE_CONTAINER_SX}>
            <LazyImage
              relativePath={image.relativePath}
              alt={`${image.characterName} ${image.poseName}`}
              sx={LAZY_IMAGE_SX}
              imgSx={LAZY_IMAGE_IMG_SX}
            />
          </Box>

          {/* Metadata sidebar */}
          <Box sx={SIDEBAR_SX}>
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
  );
}
