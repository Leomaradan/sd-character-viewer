"use client";

import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import LightModeIcon from "@mui/icons-material/LightMode";
import PaletteIcon from "@mui/icons-material/Palette";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import { useColorScheme } from "@mui/material/styles";
import type { TMajorFilter } from "@/types/library";
import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { PADDING, MARGIN_BOTTOM, BORDER_RADIUS } from "./constants";

const SIDEBAR_BOX_SX = { ...PADDING, display: "flex", flexDirection: "column", flex: 1 };
const THEME_SECTION_SX = {
  mt: "auto",
  pt: 2,
  borderTop: "1px solid",
  borderColor: "divider",
};
const THEME_TOGGLE_SX = { mt: 0.5, width: "100%" };
const THEME_BUTTON_SX = { flex: 1 };

interface ISideMenuProps {
  majorFilter: TMajorFilter;
  onMajorFilterChange: (nextFilter: TMajorFilter) => void;
}

export const SideMenu = ({ majorFilter, onMajorFilterChange }: Readonly<ISideMenuProps>) => {
  const { mode, setMode } = useColorScheme();

  const onFilterChangeCharacter = useCallback(() => {
    onMajorFilterChange("character");
  }, [onMajorFilterChange]);

  const onFilterChangeStyle = useCallback(() => {
    onMajorFilterChange("style");
  }, [onMajorFilterChange]);

  const onFilterChangePose = useCallback(() => {
    onMajorFilterChange("pose");
  }, [onMajorFilterChange]);

  const handleModeChange = useCallback(
    (_: ReactMouseEvent<HTMLElement>, newMode: "light" | "dark" | "system" | null) => {
      if (newMode) {
        setMode(newMode);
      }
    },
    [setMode],
  );

  return (
    <Box sx={SIDEBAR_BOX_SX}>
      <Typography variant="h6" sx={MARGIN_BOTTOM}>
        Categories
      </Typography>

      <List disablePadding>
        <ListItemButton
          selected={majorFilter === "character"}
          onClick={onFilterChangeCharacter}
          sx={BORDER_RADIUS}
        >
          <ListItemIcon>
            <PeopleAltIcon />
          </ListItemIcon>
          <ListItemText primary="Characters" />
        </ListItemButton>
        <ListItemButton
          selected={majorFilter === "style"}
          onClick={onFilterChangeStyle}
          sx={BORDER_RADIUS}
        >
          <ListItemIcon>
            <PaletteIcon />
          </ListItemIcon>
          <ListItemText primary="Styles" />
        </ListItemButton>
        <ListItemButton
          selected={majorFilter === "pose"}
          onClick={onFilterChangePose}
          sx={BORDER_RADIUS}
        >
          <ListItemIcon>
            <DirectionsRunIcon />
          </ListItemIcon>
          <ListItemText primary="Poses" />
        </ListItemButton>
      </List>

      <Box sx={THEME_SECTION_SX}>
        <Typography variant="overline">Theme</Typography>
        <ToggleButtonGroup
          value={mode ?? "system"}
          exclusive
          onChange={handleModeChange}
          size="small"
          sx={THEME_TOGGLE_SX}
        >
          <ToggleButton value="system" sx={THEME_BUTTON_SX} aria-label="use system theme">
            <BrightnessAutoIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="light" sx={THEME_BUTTON_SX} aria-label="use light theme">
            <LightModeIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="dark" sx={THEME_BUTTON_SX} aria-label="use dark theme">
            <DarkModeIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
};
