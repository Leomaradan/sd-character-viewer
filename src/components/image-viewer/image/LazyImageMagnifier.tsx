"use client";

import type { SxProps, Theme } from "@mui/material/styles";

import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { Box, IconButton } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getImageUrl } from "@/components/image-viewer/common/utils";

import { LazyImageMagnifierImage } from "./LazyImageMagnifierImage";

interface ILazyImageMagnifierProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  modifiedAt?: number;
}

interface IDimensions {
  width: number;
  height: number;
}

interface INaturalSize extends IDimensions {
  url: string;
}

const FALLBACK_IMAGE_SX: SxProps<Theme> = { width: "100%", height: "100%", objectFit: "cover" };
const INNER_WRAPPER_SX: SxProps<Theme> = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const ZOOM_TOGGLE_BUTTON_SX: SxProps<Theme> = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 5,
  bgcolor: "rgba(0, 0, 0, 0.7)",
  color: "#fff",
  "&:hover": { bgcolor: "rgba(0, 0, 0, 0.9)" },
};

export const LazyImageMagnifier = ({
  relativePath,
  alt,
  sx,
  modifiedAt,
}: Readonly<ILazyImageMagnifierProps>) => {
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [containerSize, setContainerSize] = useState<IDimensions | null>(null);
  const [naturalSize, setNaturalSize] = useState<INaturalSize | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);

  const handleToggleZoom = useCallback(() => {
    setZoomEnabled((previous) => !previous);
  }, []);

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
    () => getImageUrl(relativePath, { preview: false, timestamp: modifiedAt }),
    [relativePath, modifiedAt],
  );

  useEffect(() => {
    if (!shouldLoad) {
      return () => {};
    }

    const element = imageContainerRef.current;
    if (!element) {
      return () => {};
    }

    const updateContainerSize = () => {
      setContainerSize({ width: element.clientWidth, height: element.clientHeight });
    };

    updateContainerSize();

    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) {
      return () => {};
    }

    let isMounted = true;
    const preloadImage = new globalThis.Image();
    preloadImage.onload = () => {
      if (isMounted) {
        setLoadError(false);
        setNaturalSize({
          url: imageUrl,
          width: preloadImage.naturalWidth,
          height: preloadImage.naturalHeight,
        });
      }
    };
    preloadImage.onerror = () => {
      if (isMounted) {
        setLoadError(true);
      }
    };
    preloadImage.src = imageUrl;

    return () => {
      isMounted = false;
    };
  }, [shouldLoad, imageUrl]);

  const magnifierSize = useMemo(() => {
    if (
      !containerSize ||
      naturalSize?.url !== imageUrl ||
      !containerSize.width ||
      !containerSize.height
    ) {
      return null;
    }

    const scale = Math.min(
      containerSize.width / naturalSize.width,
      containerSize.height / naturalSize.height,
    );

    return {
      width: Math.round(naturalSize.width * scale),
      height: Math.round(naturalSize.height * scale),
    };
  }, [containerSize, naturalSize, imageUrl]);

  const mainImage = useMemo(
    () =>
      magnifierSize
        ? { alt, src: imageUrl, width: magnifierSize.width, height: magnifierSize.height }
        : null,
    [alt, imageUrl, magnifierSize],
  );
  const zoomImage = useMemo(() => ({ src: imageUrl }), [imageUrl]);

  return (
    <Box ref={imageContainerRef} sx={sx}>
      <Box sx={INNER_WRAPPER_SX}>
        {shouldLoad && mainImage ? (
          <LazyImageMagnifierImage
            zoomEnabled={zoomEnabled}
            alt={alt}
            mainImage={mainImage}
            zoomImage={zoomImage}
            imageUrl={imageUrl}
          />
        ) : null}
        {shouldLoad && loadError ? (
          <Box component="img" src={imageUrl} alt={alt} sx={FALLBACK_IMAGE_SX} />
        ) : null}
        {shouldLoad && mainImage ? (
          <IconButton
            aria-label={zoomEnabled ? "Disable zoom" : "Enable zoom"}
            onClick={handleToggleZoom}
            size="small"
            sx={ZOOM_TOGGLE_BUTTON_SX}
          >
            {zoomEnabled ? <ZoomOutIcon fontSize="small" /> : <ZoomInIcon fontSize="small" />}
          </IconButton>
        ) : null}
      </Box>
    </Box>
  );
};
