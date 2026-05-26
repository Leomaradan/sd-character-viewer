"use client";

import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useEffect, useRef, useState } from "react";
import { getImageUrl } from "@/components/image-viewer/utils";

interface ILazyImageProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  imgSx?: SxProps<Theme>;
}

const IMAGE_SX: SxProps<Theme> = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

export const LazyImage = ({ relativePath, alt, sx, imgSx }: Readonly<ILazyImageProps>) => {
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) {
      return;
    }

    const element = imageContainerRef.current;
    if (!element) {
      return;
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

  return (
    <Box ref={imageContainerRef} sx={sx}>
      {shouldLoad ? (
        <Box
          component="img"
          src={getImageUrl(relativePath)}
          alt={alt}
          loading="lazy"
          decoding="async"
          sx={imgSx ? { ...IMAGE_SX, ...imgSx } : IMAGE_SX}
        />
      ) : null}
    </Box>
  );
};
