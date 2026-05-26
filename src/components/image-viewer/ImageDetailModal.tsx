"use client";

import CloseIcon from "@mui/icons-material/Close";
import { Box, Dialog, DialogContent, IconButton, Typography } from "@mui/material";
import type { IImageItem, TStyle } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";
import { formatStyleLabel } from "@/components/image-viewer/utils";

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
const CAPTION_SX = { opacity: 0.7, textTransform: "uppercase" };
const META_TITLE_SX = { mt: 0.5 };
const META_BODY_SX = { mt: 0.5, opacity: 0.8 };
const FILE_PATH_SX = {
  mt: 0.5,
  opacity: 0.7,
  wordBreak: "break-all",
  fontFamily: "monospace",
  fontSize: "0.75rem",
};

interface IImageDetailModalProps {
  image: IImageItem | null;
  onClose: () => void;
  styleLabel?: (style: TStyle) => string;
}

export function ImageDetailModal({
  image,
  onClose,
  styleLabel = formatStyleLabel,
}: Readonly<IImageDetailModalProps>) {
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

            <Box>
              <Typography variant="caption" sx={CAPTION_SX}>
                Pose Base Name
              </Typography>
              <Typography variant="body2" sx={META_BODY_SX}>
                {image.poseBaseName}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={CAPTION_SX}>
                Variant
              </Typography>
              <Typography variant="body2" sx={META_BODY_SX}>
                {image.poseVariant}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={CAPTION_SX}>
                File Path
              </Typography>
              <Typography variant="body2" sx={FILE_PATH_SX}>
                {image.relativePath}
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
