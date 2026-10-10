"use client";

import { Box, Button } from "@mui/material";
import { useEffect, useRef } from "react";

interface ILoadMoreSentinelProps {
  onVisible: () => void;
}

const SENTINEL_SX = { display: "flex", justifyContent: "center", py: 2 };

// Placed after an incrementally rendered grid: asks for the next page as soon as it gets within
// ~a screen of the viewport. The parent remounts it (via `key`) after each page, so a sentinel
// that is still visible because the new page was short triggers again. The button is a fallback
// for keyboard users and browsers without IntersectionObserver.
export const LoadMoreSentinel = ({ onVisible }: Readonly<ILoadMoreSentinelProps>) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          onVisible();
        }
      },
      { rootMargin: "800px 0px" },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onVisible]);

  return (
    <Box ref={sentinelRef} sx={SENTINEL_SX}>
      <Button variant="text" onClick={onVisible}>
        Show more
      </Button>
    </Box>
  );
};
