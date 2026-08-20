"use client";

import type { SxProps, Theme } from "@mui/material/styles";

import { LazyImageMagnifier } from "./LazyImageMagnifier";
import { LazyImagePreview } from "./LazyImagePreview";

interface ILazyImageProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  imgSx?: SxProps<Theme>;
  mode?: "preview" | "magnifier";
}

export const LazyImage = ({ relativePath, alt, sx, imgSx, mode }: Readonly<ILazyImageProps>) => {
  if (mode === "magnifier") {
    return <LazyImageMagnifier relativePath={relativePath} alt={alt} sx={sx} />;
  }

  return (
    <LazyImagePreview
      relativePath={relativePath}
      alt={alt}
      sx={sx}
      imgSx={imgSx}
      usePreview={mode === "preview"}
    />
  );
};
