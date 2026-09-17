"use client";

import type { SxProps, Theme } from "@mui/material/styles";

import { isVideoRelativePath } from "@/components/image-viewer/common/utils";

import { LazyImageMagnifier } from "./LazyImageMagnifier";
import { LazyImagePreview } from "./LazyImagePreview";
import { LazyVideoPreview } from "./LazyVideoPreview";

interface ILazyImageProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  modifiedAt?: number;
  imgSx?: SxProps<Theme>;
  mode?: "preview" | "magnifier";
  onDimensionsKnown?: (width: number, height: number) => void;
}

export const LazyImage = ({
  relativePath,
  alt,
  sx,
  modifiedAt,
  imgSx,
  mode,
  onDimensionsKnown,
}: Readonly<ILazyImageProps>) => {
  if (mode === "magnifier") {
    return (
      <LazyImageMagnifier relativePath={relativePath} alt={alt} sx={sx} modifiedAt={modifiedAt} />
    );
  }

  if (isVideoRelativePath(relativePath)) {
    return (
      <LazyVideoPreview
        relativePath={relativePath}
        alt={alt}
        sx={sx}
        modifiedAt={modifiedAt}
        imgSx={imgSx}
      />
    );
  }

  return (
    <LazyImagePreview
      relativePath={relativePath}
      alt={alt}
      sx={sx}
      modifiedAt={modifiedAt}
      imgSx={imgSx}
      usePreview={mode === "preview"}
      onDimensionsKnown={onDimensionsKnown}
    />
  );
};
