"use client";

import { ToggleButton } from "@mui/material";
import { useCallback } from "react";

interface IUpscaledFilterProps {
  showOnlyUpscaled: boolean;
  onShowOnlyUpscaledChange: (enabled: boolean) => void;
}

// On: only files with an "[Upscaled]" annotation in their name (see isUpscaledFile).
export const UpscaledFilter = ({
  showOnlyUpscaled,
  onShowOnlyUpscaledChange,
}: Readonly<IUpscaledFilterProps>) => {
  const handleChange = useCallback(() => {
    onShowOnlyUpscaledChange(!showOnlyUpscaled);
  }, [onShowOnlyUpscaledChange, showOnlyUpscaled]);

  return (
    <ToggleButton
      value="upscaled"
      selected={showOnlyUpscaled}
      size="small"
      onChange={handleChange}
      aria-label="Show only upscaled files"
    >
      Upscaled
    </ToggleButton>
  );
};
