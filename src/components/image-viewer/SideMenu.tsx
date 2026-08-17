"use client";

import {
  Box,
  Button,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import LightModeIcon from "@mui/icons-material/LightMode";
import PaletteIcon from "@mui/icons-material/Palette";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import { useColorScheme } from "@mui/material/styles";
import type { ILibraryData, TCharacterSortOrder, TMajorFilter } from "@/types/library";
import { useCallback, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
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
const NEW_FILTER_SECTION_SX = {
  mt: 2,
  pt: 2,
  borderTop: "1px solid",
  borderColor: "divider",
};
const NEW_FILTER_LABEL_SX = { ml: 0 };
const CACHE_UNAVAILABLE_TEXT_SX = { display: "block", mt: 1, opacity: 0.6 };
const SORT_ORDER_SECTION_SX = { mt: 2 };
const SORT_ORDER_TOGGLE_SX = { mt: 0.5, width: "100%" };
const SORT_ORDER_BUTTON_SX = { flex: 1 };
const TOOLS_SECTION_SX = {
  mt: 2,
  pt: 2,
  borderTop: "1px solid",
  borderColor: "divider",
};
const DUPLICATE_FINDER_BUTTON_SX = { mt: 0.5, width: "100%", justifyContent: "flex-start" };
const APP_VERSION_SX = { display: "block", mt: 1.5, textAlign: "center", opacity: 0.5 };

interface ISideMenuProps {
  majorFilter: TMajorFilter;
  onMajorFilterChange: (nextFilter: TMajorFilter) => void;
  showOnlyNewImages: boolean;
  onShowOnlyNewImagesChange: (enabled: boolean) => void;
  characterSortOrder?: TCharacterSortOrder;
  onCharacterSortOrderChange?: (nextSortOrder: TCharacterSortOrder) => void;
  library: ILibraryData;
  canManageDuplicates?: boolean;
  onOpenDuplicateFinder?: () => void;
  appVersion?: string;
}

export const SideMenu = ({
  majorFilter,
  onMajorFilterChange,
  showOnlyNewImages,
  onShowOnlyNewImagesChange,
  characterSortOrder = "name",
  onCharacterSortOrderChange,
  library,
  canManageDuplicates = false,
  onOpenDuplicateFinder,
  appVersion,
}: Readonly<ISideMenuProps>) => {
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

  const handleNewImagesToggle = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      onShowOnlyNewImagesChange(checked);
    },
    [onShowOnlyNewImagesChange],
  );

  const handleSortOrderChange = useCallback(
    (_: ReactMouseEvent<HTMLElement>, newSortOrder: TCharacterSortOrder | null) => {
      if (newSortOrder) {
        onCharacterSortOrderChange?.(newSortOrder);
      }
    },
    [onCharacterSortOrderChange],
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

      <Box sx={NEW_FILTER_SECTION_SX}>
        <Typography variant="overline">Filters</Typography>
        {library.cacheAvailable ? (
          <FormControlLabel
            sx={NEW_FILTER_LABEL_SX}
            control={<Switch checked={showOnlyNewImages} onChange={handleNewImagesToggle} />}
            label="Show new only"
          />
        ) : (
          <Typography variant="caption" sx={CACHE_UNAVAILABLE_TEXT_SX}>
            Cache unavailable - refresh disabled
          </Typography>
        )}

        <Box sx={SORT_ORDER_SECTION_SX}>
          <Typography variant="overline">Sort by</Typography>
          <ToggleButtonGroup
            value={characterSortOrder}
            exclusive
            onChange={handleSortOrderChange}
            size="small"
            sx={SORT_ORDER_TOGGLE_SX}
          >
            <ToggleButton value="name" sx={SORT_ORDER_BUTTON_SX} aria-label="sort by name">
              Name
            </ToggleButton>
            <ToggleButton value="date" sx={SORT_ORDER_BUTTON_SX} aria-label="sort by date">
              Date
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {canManageDuplicates && (
        <Box sx={TOOLS_SECTION_SX}>
          <Typography variant="overline">Tools</Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={onOpenDuplicateFinder}
            sx={DUPLICATE_FINDER_BUTTON_SX}
          >
            Duplicate Finder
          </Button>
        </Box>
      )}

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

        {appVersion && (
          <Typography variant="caption" sx={APP_VERSION_SX}>
            v{appVersion}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
