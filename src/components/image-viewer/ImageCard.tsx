"use client";

import { Card, CardActionArea, CardContent, Typography } from "@mui/material";
import { useCallback } from "react";
import type { IImageItem } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";

interface IImageCardProps {
  image: IImageItem;
  onSelect?: (image: IImageItem) => void;
}

const IMAGE_CARD = {
  width: "100%",
  aspectRatio: "3 / 4",
  borderBottom: "1px solid",
  borderColor: "divider",
};

export const ImageCard = ({ image, onSelect }: Readonly<IImageCardProps>) => {
  const handleClick = useCallback(() => {
    onSelect?.(image);
  }, [image, onSelect]);

  return (
    <Card elevation={1}>
      <CardActionArea onClick={handleClick}>
        <LazyImage
          relativePath={image.relativePath}
          alt={`${image.characterName} ${image.poseName}`}
          sx={IMAGE_CARD}
        />
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
