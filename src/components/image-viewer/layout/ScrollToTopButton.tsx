"use client";

import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { Fab } from "@mui/material";
import { useCallback, useEffect, useState } from "react";

const SCROLL_THRESHOLD = 300;

const FAB_SX = {
  position: "fixed",
  bottom: { xs: 16, sm: 24 },
  right: { xs: 16, sm: 24 },
  zIndex: 1200,
};

export const ScrollToTopButton = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > SCROLL_THRESHOLD);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleClick = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <Fab size="small" color="primary" aria-label="scroll to top" onClick={handleClick} sx={FAB_SX}>
      <KeyboardArrowUpIcon />
    </Fab>
  );
};
