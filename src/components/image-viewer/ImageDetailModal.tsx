"use client";

import CloseIcon from "@mui/icons-material/Close";
import { Box, Dialog, DialogContent, IconButton, Typography } from "@mui/material";
import type { IImageItem, TStyle } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";
import { formatStyleLabel } from "@/components/image-viewer/utils";

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
    <Dialog open={Boolean(image)} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogContent sx={{ p: 0, bgcolor: "#000" }}>
        <Box sx={{ display: "flex", height: "600px", position: "relative" }}>
          {/* Close button */}
          <IconButton
            onClick={onClose}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              bgcolor: "rgba(0, 0, 0, 0.7)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(0, 0, 0, 0.9)" },
            }}
          >
            <CloseIcon />
          </IconButton>

          {/* Image */}
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LazyImage
              relativePath={image.relativePath}
              alt={`${image.characterName} ${image.poseName}`}
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </Box>

          {/* Metadata sidebar */}
          <Box
            sx={{
              width: 280,
              bgcolor: "#1e1e1e",
              color: "#fff",
              overflowY: "auto",
              p: 3,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "uppercase" }}>
                Character
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                {image.characterName}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "uppercase" }}>
                Style
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                {styleLabel(image.style)}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "uppercase" }}>
                Pose
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                {image.poseName}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "uppercase" }}>
                Pose Base Name
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.8 }}>
                {image.poseBaseName}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "uppercase" }}>
                Variant
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.8 }}>
                {image.poseVariant}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "uppercase" }}>
                File Path
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  opacity: 0.7,
                  wordBreak: "break-all",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                }}
              >
                {image.relativePath}
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
