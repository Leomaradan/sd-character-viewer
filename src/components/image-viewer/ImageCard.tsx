"use client";

import { Card, CardContent, Typography } from "@mui/material";
import type { IImageItem } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/LazyImage";

interface IImageCardProps {
  image: IImageItem;
}

export function ImageCard({ image }: Readonly<IImageCardProps>) {
  return (
    <Card elevation={1}>
      <LazyImage
        relativePath={image.relativePath}
        alt={`${image.characterName} ${image.poseName}`}
        sx={{
          width: "100%",
          aspectRatio: "3 / 4",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      />
      <CardContent>
        <Typography variant="subtitle1" noWrap>
          {image.characterName}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {image.style} - {image.poseName}
        </Typography>
      </CardContent>
    </Card>
  );
}
