"use client";

import { Box, Checkbox, FormControlLabel } from "@mui/material";
import { useCallback, useState } from "react";

import type { TRatingFilter, TRatingFilterOption } from "@/types/library";

import { RATING_FILTER_OPTIONS } from "./persistent-filters";

interface IRatingFilterProps {
  ratingFilter: TRatingFilter;
  onRatingFilterChange: (ratingFilter: TRatingFilter) => void;
}

const RATING_FILTER_LABELS: Record<TRatingFilterOption, string> = {
  unrated: "Unrated",
  ok: "OK",
  good: "Good",
};

const RATING_FILTER_SX = { display: "flex", flexWrap: "wrap", alignItems: "center" };
const RATING_LABEL_SX = { mr: 1 };

// Shows the files whose rating is checked ("Unrated" = no rating yet); nothing checked shows all.
export const RatingFilter = ({
  ratingFilter,
  onRatingFilterChange,
}: Readonly<IRatingFilterProps>) => {
  // The prop only changes once the URL update lands, so clicks made before that build on the
  // last selection made here instead (otherwise a quick second click would drop the first).
  const [selection, setSelection] = useState(ratingFilter);
  const [syncedRatingFilter, setSyncedRatingFilter] = useState(ratingFilter);
  if (syncedRatingFilter !== ratingFilter) {
    setSyncedRatingFilter(ratingFilter);
    setSelection(ratingFilter);
  }

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { checked, value } = event.target;
      const nextSelection = RATING_FILTER_OPTIONS.filter((option) =>
        option === value ? checked : selection.includes(option),
      );
      setSelection(nextSelection);
      onRatingFilterChange(nextSelection);
    },
    [selection, onRatingFilterChange],
  );

  return (
    <Box role="group" aria-label="Filter by rating" sx={RATING_FILTER_SX}>
      {RATING_FILTER_OPTIONS.map((option) => (
        <FormControlLabel
          key={option}
          sx={RATING_LABEL_SX}
          control={
            <Checkbox
              size="small"
              value={option}
              checked={selection.includes(option)}
              onChange={handleChange}
            />
          }
          label={RATING_FILTER_LABELS[option]}
        />
      ))}
    </Box>
  );
};
