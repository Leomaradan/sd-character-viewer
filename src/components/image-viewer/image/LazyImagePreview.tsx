"use client";

import type { SxProps, Theme } from "@mui/material/styles";

import { Box } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

import { getImageUrl } from "@/components/image-viewer/common/utils";

interface ILazyImagePreviewProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  imgSx?: SxProps<Theme>;
  usePreview?: boolean;
}

const IMAGE_SX: SxProps<Theme> = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

export const LazyImagePreview = ({
  relativePath,
  alt,
  sx,
  imgSx,
  usePreview = false,
}: Readonly<ILazyImagePreviewProps>) => {
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  // oxlint-disable-next-line typescript/no-misused-spread
  const mergedImgSx = useMemo(() => (imgSx ? { ...IMAGE_SX, ...imgSx } : IMAGE_SX), [imgSx]);

  useEffect(() => {
    if (shouldLoad) {
      return () => {};
    }

    const element = imageContainerRef.current;
    if (!element) {
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);

        if (isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [shouldLoad]);

  const imageUrl = useMemo(
    () => getImageUrl(relativePath, { preview: usePreview }),
    [relativePath, usePreview],
  );

  return (
    <Box ref={imageContainerRef} sx={sx}>
      {shouldLoad ? (
        <Box
          component="img"
          className="image-container"
          src={imageUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          sx={mergedImgSx}
        />
      ) : null}
    </Box>
  );
};
