"use client";

import StarIcon from "@mui/icons-material/Star";
import VideocamIcon from "@mui/icons-material/Videocam";
import { Box, Card, CardActionArea, CardContent, Typography } from "@mui/material";
import { useCallback } from "react";

import type { IImageItem } from "@/types/library";

import { formatStyleLabel } from "@/components/image-viewer/common/utils";
import { LazyImage } from "@/components/image-viewer/image/LazyImage";

interface IImageCardProps {
  image: IImageItem;
  showNewBadge?: boolean;
  styleLabel?: (style: string) => string;
  onSelect?: (image: IImageItem) => void;
}

const IMAGE_CARD = {
  width: "100%",
  aspectRatio: "3 / 4",
  borderBottom: "1px solid",
  borderColor: "divider",
};

const IMAGE_WRAPPER_SX = { position: "relative" };

const NEW_BADGE_SX = {
  position: "absolute",
  top: 6,
  right: 6,
  color: "warning.main",
  bgcolor: "rgba(0,0,0,0.45)",
  borderRadius: "50%",
  p: "2px",
  display: "flex",
  pointerEvents: "none",
};

const VIDEO_BADGE_SX = {
  position: "absolute",
  top: 6,
  left: 6,
  color: "common.white",
  bgcolor: "rgba(0,0,0,0.45)",
  borderRadius: "50%",
  p: "2px",
  display: "flex",
  pointerEvents: "none",
};

const CARD_TITLE_SX = {
  display: "flex",
  alignItems: "center",
  gap: 0.5,
};

export const ImageCard = ({
  image,
  showNewBadge = false,
  styleLabel = formatStyleLabel,
  onSelect,
}: Readonly<IImageCardProps>) => {
  const handleClick = useCallback(() => {
    onSelect?.(image);
  }, [image, onSelect]);

  return (
    <Card elevation={1}>
      <CardActionArea onClick={handleClick}>
        <Box sx={IMAGE_WRAPPER_SX}>
          <LazyImage
            relativePath={image.relativePath}
            alt={`${image.characterName} ${image.poseName}`}
            sx={IMAGE_CARD}
            modifiedAt={image.modifiedAt}
            mode="preview"
          />
          {image.mediaType === "video" && (
            <Box sx={VIDEO_BADGE_SX} aria-label="Video">
              <VideocamIcon fontSize="small" />
            </Box>
          )}
          {showNewBadge && image.isNew && (
            <Box sx={NEW_BADGE_SX} aria-label="New image">
              <StarIcon fontSize="small" />
            </Box>
          )}
        </Box>
        <CardContent>
          <Typography variant="subtitle1" noWrap sx={CARD_TITLE_SX}>
            {image.characterName}
            {image.mediaType === "video" && (
              <VideocamIcon fontSize="inherit" color="action" aria-hidden="true" />
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {styleLabel(image.style)} - {image.poseName}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};
