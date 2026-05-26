"use client";

import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import type { TMajorFilter } from "@/types/library";
import { formatMajorFilterLabel } from "@/components/image-viewer/utils";
import { useCallback } from "react";
import { PADDING, MARGIN_BOTTOM, BORDER_RADIUS, MARGIN_TOP_2 } from "./constants";

interface ISideMenuProps {
  majorFilter: TMajorFilter;
  onMajorFilterChange: (nextFilter: TMajorFilter) => void;
}

export const SideMenu = ({ majorFilter, onMajorFilterChange }: Readonly<ISideMenuProps>) => {
  const onFilterChangeCharacter = useCallback(() => {
    onMajorFilterChange("character");
  }, [onMajorFilterChange]);

  const onFilterChangeStyle = useCallback(() => {
    onMajorFilterChange("style");
  }, [onMajorFilterChange]);

  const onFilterChangePose = useCallback(() => {
    onMajorFilterChange("pose");
  }, [onMajorFilterChange]);

  return (
    <Box sx={PADDING}>
      <Typography variant="h6" sx={MARGIN_BOTTOM}>
        Major Filter
      </Typography>

      <List disablePadding>
        <ListItemButton
          selected={majorFilter === "character"}
          onClick={onFilterChangeCharacter}
          sx={BORDER_RADIUS}
        >
          <ListItemText primary="Filter by Character" />
        </ListItemButton>
        <ListItemButton
          selected={majorFilter === "style"}
          onClick={onFilterChangeStyle}
          sx={BORDER_RADIUS}
        >
          <ListItemText primary="Filter by Style" />
        </ListItemButton>
        <ListItemButton
          selected={majorFilter === "pose"}
          onClick={onFilterChangePose}
          sx={BORDER_RADIUS}
        >
          <ListItemText primary="Filter by Pose" />
        </ListItemButton>
      </List>

      <Typography variant="body2" color="text.secondary" sx={MARGIN_TOP_2}>
        {formatMajorFilterLabel(majorFilter)}
      </Typography>
    </Box>
  );
};
