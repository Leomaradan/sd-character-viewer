"use client";

import { Chip } from "@mui/material";
import { formatStyleLabel } from "@/components/image-viewer/utils";
import { useCallback } from "react";

interface IStyleViewProps {
  style: string;
  primary: boolean;
  styleLabel?: (style: string) => string;
  onStyleSelect: (style: string) => void;
}

export const StyleView = ({
  style,
  primary,
  styleLabel = formatStyleLabel,

  onStyleSelect,
}: Readonly<IStyleViewProps>) => {
  const handleOnClickStyleChip = useCallback(() => {
    onStyleSelect(style);
  }, [onStyleSelect, style]);

  return (
    <Chip
      label={styleLabel(style)}
      color={primary ? "primary" : "default"}
      onClick={handleOnClickStyleChip}
    />
  );
};
