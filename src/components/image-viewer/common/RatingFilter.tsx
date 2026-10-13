"use client";

import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useCallback } from "react";

import type { TRatingFilter } from "@/types/library";

interface IRatingFilterProps {
  ratingFilter: TRatingFilter;
  onRatingFilterChange: (ratingFilter: TRatingFilter) => void;
}

// "Unrated" = no OK/Good rating yet; "Good" = rated Good only.
export const RatingFilter = ({
  ratingFilter,
  onRatingFilterChange,
}: Readonly<IRatingFilterProps>) => {
  const handleChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, nextValue: TRatingFilter | null) => {
      if (nextValue) {
        onRatingFilterChange(nextValue);
      }
    },
    [onRatingFilterChange],
  );

  return (
    <ToggleButtonGroup
      value={ratingFilter}
      exclusive
      size="small"
      onChange={handleChange}
      aria-label="Filter by rating"
    >
      <ToggleButton value="unrated">Unrated</ToggleButton>
      <ToggleButton value="good">Good</ToggleButton>
      <ToggleButton value="all">All</ToggleButton>
    </ToggleButtonGroup>
  );
};
