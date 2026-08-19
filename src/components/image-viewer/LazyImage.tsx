"use client";

import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { getImageUrl } from "@/components/image-viewer/utils";
import { EasyZoomOnMove } from "easy-magnify";

interface ILazyImageProps {
  relativePath: string;
  alt: string;
  sx: SxProps<Theme>;
  imgSx?: SxProps<Theme>;
  usePreview?: boolean;
  useMagnifier?: boolean;
}

interface IDimensions {
  width: number;
  height: number;
}

interface INaturalSize extends IDimensions {
  url: string;
}

const IMAGE_SX: SxProps<Theme> = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

export const LazyImage = ({
  relativePath,
  alt,
  sx,
  imgSx,
  usePreview = false,
  useMagnifier = false,
}: Readonly<ILazyImageProps>) => {
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const mergedImgSx = useMemo(() => (imgSx ? { ...IMAGE_SX, ...imgSx } : IMAGE_SX), [imgSx]);
  const [containerSize, setContainerSize] = useState<IDimensions | null>(null);
  const [naturalSize, setNaturalSize] = useState<INaturalSize | null>(null);

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

  const imageUrls = useMemo(
    () => ({
      preview: getImageUrl(relativePath, { preview: usePreview }),
      full: getImageUrl(relativePath, { preview: false }),
    }),
    [relativePath, usePreview],
  );

  useEffect(() => {
    if (!useMagnifier || !shouldLoad) {
      return;
    }

    const element = imageContainerRef.current;
    if (!element) {
      return;
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
  }, [useMagnifier, shouldLoad]);

  useEffect(() => {
    if (!useMagnifier || !shouldLoad) {
      return;
    }

    let isMounted = true;
    const preloadImage = new globalThis.Image();
    preloadImage.onload = () => {
      if (isMounted) {
        setNaturalSize({
          url: imageUrls.full,
          width: preloadImage.naturalWidth,
          height: preloadImage.naturalHeight,
        });
      }
    };
    preloadImage.src = imageUrls.full;

    return () => {
      isMounted = false;
    };
  }, [useMagnifier, shouldLoad, imageUrls.full]);

  const magnifierSize = useMemo(() => {
    if (
      !containerSize ||
      naturalSize?.url !== imageUrls.full ||
      !containerSize.width ||
      !containerSize.height
    ) {
      return null;
    }

    if (usePreview) {
      return {
        width: naturalSize.width,
        height: naturalSize.height,
      };
    }

    const scale = Math.min(
      containerSize.width / naturalSize.width,
      containerSize.height / naturalSize.height,
    );

    return {
      width: Math.round(naturalSize.width * scale),
      height: Math.round(naturalSize.height * scale),
    };
  }, [containerSize, naturalSize, imageUrls.full, usePreview]);

  const mainImage = useMemo(
    () =>
      magnifierSize
        ? { alt, src: imageUrls.preview, width: magnifierSize.width, height: magnifierSize.height }
        : null,
    [alt, imageUrls.preview, magnifierSize],
  );
  const zoomImage = useMemo(() => ({ src: imageUrls.full }), [imageUrls.full]);

  if (useMagnifier) {
    return (
      <Box ref={imageContainerRef} sx={sx}>
        {shouldLoad && mainImage ? (
          <EasyZoomOnMove mainImage={mainImage} zoomImage={zoomImage} />
        ) : null}
      </Box>
    );
  }

  return (
    <Box ref={imageContainerRef} sx={sx}>
      {shouldLoad ? (
        <Box
          component="img"
          className="image-container"
          src={imageUrls.preview}
          alt={alt}
          loading="lazy"
          decoding="async"
          sx={mergedImgSx}
        />
      ) : null}
    </Box>
  );
};
