"use client";

import { Box, Card, CardActionArea, CardContent, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import { useCallback } from "react";
import type { IImageItem } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";

interface IImageCardProps {
  image: IImageItem;
  showNewBadge?: boolean;
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

export const ImageCard = ({ image, showNewBadge = false, onSelect }: Readonly<IImageCardProps>) => {
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
          />
          {showNewBadge && image.isNew && (
            <Box sx={NEW_BADGE_SX} aria-label="New image">
              <StarIcon fontSize="small" />
            </Box>
          )}
        </Box>
        <CardContent>
          <Typography variant="subtitle1" noWrap>
            {image.characterName}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {image.style} - {image.poseName}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};
