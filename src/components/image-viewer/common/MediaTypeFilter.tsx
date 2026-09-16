"use client";

import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useCallback } from "react";

import type { TMediaTypeFilter } from "@/types/library";

interface IMediaTypeFilterProps {
  mediaTypeFilter: TMediaTypeFilter;
  onMediaTypeFilterChange: (mediaTypeFilter: TMediaTypeFilter) => void;
}

export const MediaTypeFilter = ({
  mediaTypeFilter,
  onMediaTypeFilterChange,
}: Readonly<IMediaTypeFilterProps>) => {
  const handleChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, nextValue: TMediaTypeFilter | null) => {
      if (nextValue) {
        onMediaTypeFilterChange(nextValue);
      }
    },
    [onMediaTypeFilterChange],
  );

  return (
    <ToggleButtonGroup
      value={mediaTypeFilter}
      exclusive
      size="small"
      onChange={handleChange}
      aria-label="Filter by media type"
    >
      <ToggleButton value="image">Images</ToggleButton>
      <ToggleButton value="video">Videos</ToggleButton>
      <ToggleButton value="both">Both</ToggleButton>
    </ToggleButtonGroup>
  );
};
