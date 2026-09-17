"use client";

import type { SxProps, Theme } from "@mui/material/styles";

import { Box } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getImageUrl } from "@/components/image-viewer/common/utils";

interface ILazyVideoPreviewProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  modifiedAt?: number;
  imgSx?: SxProps<Theme>;
}

const MEDIA_SX: SxProps<Theme> = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

// There is no automatic poster-frame generation for video (no ffmpeg tooling in this project),
// only a manually-provided "<name>.preview.png" sidecar. This component optimistically requests
// that sidecar as a plain <img>; the backend 404s a variant=preview request for video when no
// sidecar exists (see /api/image), so onError reliably signals "no sidecar" and this swaps to a
// native, non-autoplaying <video> thumbnail instead.
export const LazyVideoPreview = ({
  relativePath,
  alt,
  sx,
  modifiedAt,
  imgSx,
}: Readonly<ILazyVideoPreviewProps>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [usePosterFallback, setUsePosterFallback] = useState(false);
  // oxlint-disable-next-line typescript/no-misused-spread
  const mergedSx = useMemo(() => (imgSx ? { ...MEDIA_SX, ...imgSx } : MEDIA_SX), [imgSx]);

  useEffect(() => {
    if (shouldLoad) {
      return () => {};
    }

    const element = containerRef.current;
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

  const posterUrl = useMemo(
    () => getImageUrl(relativePath, { preview: true, timestamp: modifiedAt }),
    [relativePath, modifiedAt],
  );
  const videoUrl = useMemo(
    () => getImageUrl(relativePath, { timestamp: modifiedAt }),
    [relativePath, modifiedAt],
  );

  const handlePosterError = useCallback(() => {
    setUsePosterFallback(true);
  }, []);

  return (
    <Box ref={containerRef} sx={sx}>
      {shouldLoad && !usePosterFallback && (
        <Box
          component="img"
          src={posterUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          sx={mergedSx}
          onError={handlePosterError}
        />
      )}
      {shouldLoad && usePosterFallback && (
        <Box
          component="video"
          src={videoUrl}
          aria-label={alt}
          muted
          playsInline
          preload="metadata"
          sx={mergedSx}
        />
      )}
    </Box>
  );
};
