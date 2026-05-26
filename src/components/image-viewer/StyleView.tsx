"use client";

import { Chip } from "@mui/material";
import { formatStyleLabel } from "@/components/image-viewer/utils";
import type { TStyle } from "@/types/library";
import { useCallback } from "react";

interface IStyleViewProps {
  style: TStyle;
  primary: boolean;
  onStyleSelect: (style: TStyle) => void;
}

export const StyleView = ({
  style,
  primary,

  onStyleSelect,
}: Readonly<IStyleViewProps>) => {
  const handleOnClickStyleChip = useCallback(() => {
    onStyleSelect(style);
  }, [onStyleSelect, style]);

  return (
    <Chip
      label={formatStyleLabel(style)}
      color={primary ? "primary" : "default"}
      onClick={handleOnClickStyleChip}
    />
  );
};
