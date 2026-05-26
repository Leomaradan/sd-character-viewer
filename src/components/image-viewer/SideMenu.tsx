"use client";

import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import type { TMajorFilter } from "@/types/library";
import { formatMajorFilterLabel } from "@/components/image-viewer/utils";

interface ISideMenuProps {
  majorFilter: TMajorFilter;
  onMajorFilterChange: (nextFilter: TMajorFilter) => void;
}

export function SideMenu({ majorFilter, onMajorFilterChange }: Readonly<ISideMenuProps>) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Major Filter
      </Typography>

      <List disablePadding>
        <ListItemButton
          selected={majorFilter === "character"}
          onClick={() => onMajorFilterChange("character")}
          sx={{ borderRadius: 1 }}
        >
          <ListItemText primary="Filter by Character" />
        </ListItemButton>
        <ListItemButton
          selected={majorFilter === "style"}
          onClick={() => onMajorFilterChange("style")}
          sx={{ borderRadius: 1 }}
        >
          <ListItemText primary="Filter by Style" />
        </ListItemButton>
        <ListItemButton
          selected={majorFilter === "pose"}
          onClick={() => onMajorFilterChange("pose")}
          sx={{ borderRadius: 1 }}
        >
          <ListItemText primary="Filter by Pose" />
        </ListItemButton>
      </List>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {formatMajorFilterLabel(majorFilter)}
      </Typography>
    </Box>
  );
}
