"use client";

import type { SxProps, Theme } from "@mui/material/styles";

import { Box } from "@mui/material";
import { EasyZoomOnMove } from "easy-magnify";

interface ILazyImageMagnifierImageProps {
  zoomEnabled: boolean;
  alt: string;
  mainImage: {
    alt: string;
    src: string;
    width: number;
    height: number;
  };
  zoomImage: {
    src: string;
  };
  imageUrl: string;
}

const PLAIN_IMAGE_SX: SxProps<Theme> = {
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
  display: "block",
};

export const LazyImageMagnifierImage = ({
  zoomEnabled,
  alt,
  mainImage,
  zoomImage,
  imageUrl,
}: Readonly<ILazyImageMagnifierImageProps>) => {
  if (zoomEnabled) {
    // The full image is already loaded (it's the mainImage/imageUrl we're already showing),
    // so skip easy-magnify's default 1600ms reveal skeleton.
    return <EasyZoomOnMove mainImage={mainImage} zoomImage={zoomImage} delayTimer={0} />;
  }

  return <Box component="img" src={imageUrl} alt={alt} sx={PLAIN_IMAGE_SX} />;
};
