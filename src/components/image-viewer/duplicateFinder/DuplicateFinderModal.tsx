"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Radio,
  Select,
  type SelectChangeEvent,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { IDuplicateGroup, IImageItem } from "@/types/library";

import { formatStyleLabel } from "@/components/image-viewer/common/utils";
import { LazyImage } from "@/components/image-viewer/image/LazyImage";

const DIALOG_SX = { "& .MuiDialog-paper": { height: "90vh" } };
const DIALOG_TITLE_SX = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const EMPTY_STATE_SX = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  py: 6,
  opacity: 0.7,
};
const LOADING_SX = { display: "flex", justifyContent: "center", py: 6 };
const FILTER_BAR_SX = { mb: 3, display: "flex", alignItems: "center", gap: 2 };
const STYLE_FILTER_SX = { minWidth: 220 };
const GROUP_BOX_SX = { pb: 3, mb: 3 };
const GROUP_HEADER_SX = {
  mb: 1.5,
  display: "flex",
  alignItems: "center",
  gap: 1,
  width: "100%",
  border: "none",
  background: "none",
  p: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  userSelect: "none",
};
const GROUP_HEADER_TEXT_SX = { flex: 1, minWidth: 0 };
const GROUP_TITLE_SX = { fontWeight: 600 };
const GROUP_SUBTITLE_SX = { opacity: 0.7 };
const EXPAND_ICON_SX = {
  transition: "transform 0.2s",
  transform: "rotate(0deg)",
};
const EXPAND_ICON_COLLAPSED_SX = {
  transition: "transform 0.2s",
  transform: "rotate(-90deg)",
};
const IMAGES_GRID_SX = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(2, minmax(0, 1fr))",
    md: "repeat(var(--duplicate-columns), minmax(0, 1fr))",
  },
  gap: 2,
  alignItems: "start",
};
const IMAGE_ITEM_SX = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  minWidth: 0,
};
const IMAGE_THUMB_SX = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 1,
  overflow: "hidden",
};
const IMAGE_FILL_SX = { width: "100%" };
const IMAGE_UNCROPPED_SX = {
  width: "100%",
  height: "auto",
  maxHeight: "65vh",
  objectFit: "contain",
};
const FILE_NAME_SX = { mt: 0.5, wordBreak: "break-word", textAlign: "center" };
const GROUP_ACTIONS_SX = { mt: 2, display: "flex", alignItems: "center", gap: 2 };
const GROUP_ERROR_SX = { mt: 1 };
const GROUP_DIVIDER_SX = { mt: 3 };

interface IDuplicateFinderModalProps {
  open: boolean;
  onClose: () => void;
  onChangesApplied?: () => void;
  styleLabel?: (style: string) => string;
}

interface IGroupSelection {
  primaryRelativePath: string;
  keptRelativePaths: Set<string>;
}

const getFileName = (image: IImageItem): string => image.relativePath.split("/").pop() ?? "";

const buildDefaultSelection = (group: IDuplicateGroup): IGroupSelection => {
  const [primaryImage, ...otherImages] = group.images;

  return {
    primaryRelativePath: primaryImage.relativePath,
    keptRelativePaths: new Set(otherImages.map((image) => image.relativePath)),
  };
};

interface IDuplicateImageItemProps {
  image: IImageItem;
  groupId: string;
  isPrimary: boolean;
  isKept: boolean;
  isValidating: boolean;
  onDimensionsKnown: (width: number, height: number) => void;
  onPrimaryChange: (groupId: string, relativePath: string) => void;
  onKeptToggle: (groupId: string, relativePath: string, checked: boolean) => void;
}

const DuplicateImageItem = ({
  image,
  groupId,
  isPrimary,
  isKept,
  isValidating,
  onDimensionsKnown,
  onPrimaryChange,
  onKeptToggle,
}: Readonly<IDuplicateImageItemProps>) => {
  const handlePrimarySelect = useCallback(() => {
    onPrimaryChange(groupId, image.relativePath);
  }, [onPrimaryChange, groupId, image.relativePath]);

  const handleKeptChange = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      onKeptToggle(groupId, image.relativePath, checked);
    },
    [onKeptToggle, groupId, image.relativePath],
  );

  return (
    <Box sx={IMAGE_ITEM_SX}>
      <Box sx={IMAGE_THUMB_SX}>
        <LazyImage
          relativePath={image.relativePath}
          alt={`${image.characterName} ${image.poseName}`}
          sx={IMAGE_FILL_SX}
          imgSx={IMAGE_UNCROPPED_SX}
          modifiedAt={image.modifiedAt}
          onDimensionsKnown={onDimensionsKnown}
        />
      </Box>
      <Typography variant="caption" sx={FILE_NAME_SX}>
        {getFileName(image)}
      </Typography>
      <FormControlLabel
        control={
          <Radio
            checked={isPrimary}
            name={`primary-${groupId}`}
            onChange={handlePrimarySelect}
            disabled={isValidating}
            size="small"
          />
        }
        label="Primary"
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={isKept}
            onChange={handleKeptChange}
            disabled={isValidating || isPrimary}
            size="small"
          />
        }
        label="Keep"
      />
    </Box>
  );
};

interface IDuplicateGroupCardProps {
  group: IDuplicateGroup;
  selection: IGroupSelection;
  isValidating: boolean;
  isRedrawing: boolean;
  isLast: boolean;
  isExpanded: boolean;
  groupError?: string;
  styleLabel: (style: string) => string;
  onPrimaryChange: (groupId: string, relativePath: string) => void;
  onKeptToggle: (groupId: string, relativePath: string, checked: boolean) => void;
  onValidate: (group: IDuplicateGroup) => void;
  onReject: (group: IDuplicateGroup) => void;
  onRedrawPrimary: (group: IDuplicateGroup, primaryRelativePath: string) => void;
  onToggleExpand: (groupId: string) => void;
}

const DuplicateGroupCard = ({
  group,
  selection,
  isValidating,
  isRedrawing,
  isLast,
  isExpanded,
  groupError,
  styleLabel,
  onPrimaryChange,
  onKeptToggle,
  onValidate,
  onReject,
  onRedrawPrimary,
  onToggleExpand,
}: Readonly<IDuplicateGroupCardProps>) => {
  const [hasHorizontalImage, setHasHorizontalImage] = useState(false);
  const isBusy = isValidating || isRedrawing;
  const handleValidateClick = useCallback(() => {
    onValidate(group);
  }, [onValidate, group]);

  const handleRejectClick = useCallback(() => {
    onReject(group);
  }, [onReject, group]);
  const handleRedrawPrimaryClick = useCallback(() => {
    onRedrawPrimary(group, selection.primaryRelativePath);
  }, [onRedrawPrimary, group, selection.primaryRelativePath]);
  const handleDimensionsKnown = useCallback((width: number, height: number) => {
    if (width > height) {
      setHasHorizontalImage(true);
    }
  }, []);
  const handleHeaderClick = useCallback(() => {
    onToggleExpand(group.id);
  }, [onToggleExpand, group.id]);
  const columnCount = Math.min(group.images.length, hasHorizontalImage ? 3 : 4);

  const style = useMemo(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    () => ({ "--duplicate-columns": columnCount }) as React.CSSProperties,
    [columnCount],
  );

  return (
    <Box sx={GROUP_BOX_SX}>
      <Box
        component="button"
        type="button"
        sx={GROUP_HEADER_SX}
        onClick={handleHeaderClick}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} group ${group.characterName} - ${group.poseBaseName}`}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={isExpanded ? EXPAND_ICON_SX : EXPAND_ICON_COLLAPSED_SX}
        />
        <Box sx={GROUP_HEADER_TEXT_SX}>
          <Typography variant="subtitle1" sx={GROUP_TITLE_SX}>
            {group.characterName} - {group.poseBaseName}
          </Typography>
          <Typography variant="body2" sx={GROUP_SUBTITLE_SX}>
            {styleLabel(group.style)} - {group.images.length} images
          </Typography>
        </Box>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={IMAGES_GRID_SX} style={style} data-testid={`duplicate-images-${group.id}`}>
          {group.images.map((image) => {
            const isPrimary = selection.primaryRelativePath === image.relativePath;
            const isKept = isPrimary || selection.keptRelativePaths.has(image.relativePath);

            return (
              <DuplicateImageItem
                key={image.id}
                image={image}
                groupId={group.id}
                isPrimary={isPrimary}
                isKept={isKept}
                isValidating={isBusy}
                onDimensionsKnown={handleDimensionsKnown}
                onPrimaryChange={onPrimaryChange}
                onKeptToggle={onKeptToggle}
              />
            );
          })}
        </Box>

        <Box sx={GROUP_ACTIONS_SX}>
          <Button variant="contained" onClick={handleValidateClick} disabled={isBusy}>
            {isValidating ? <CircularProgress size={18} /> : "Validate"}
          </Button>
          <Button color="error" onClick={handleRejectClick} disabled={isBusy}>
            Reject group
          </Button>
          <Button
            variant="outlined"
            startIcon={!isRedrawing && <RefreshIcon />}
            onClick={handleRedrawPrimaryClick}
            disabled={isBusy}
          >
            {isRedrawing ? <CircularProgress size={18} /> : "Redraw primary"}
          </Button>
        </Box>

        {groupError && (
          <Alert severity="error" sx={GROUP_ERROR_SX}>
            {groupError}
          </Alert>
        )}
      </Collapse>

      {!isLast && <Divider sx={GROUP_DIVIDER_SX} />}
    </Box>
  );
};

export function DuplicateFinderModal({
  open,
  onClose,
  onChangesApplied,
  styleLabel = formatStyleLabel,
}: Readonly<IDuplicateFinderModalProps>) {
  const [groups, setGroups] = useState<IDuplicateGroup[]>([]);
  const [selections, setSelections] = useState<Record<string, IGroupSelection>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [validatingGroupId, setValidatingGroupId] = useState<string | null>(null);
  const [redrawingGroupId, setRedrawingGroupId] = useState<string | null>(null);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const [pendingRejectGroup, setPendingRejectGroup] = useState<IDuplicateGroup | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(new Set());
  // Bumped on every new load and whenever the dialog closes, so a response for a superseded
  // (or since-closed) request can be detected and ignored instead of overwriting fresher state.
  const loadRequestIdRef = useRef(0);

  const loadGroups = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/duplicates", { cache: "no-store" });
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setLoadError("Could not load duplicate groups. Try again.");
        return;
      }

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const data = (await response.json()) as { groups: IDuplicateGroup[] };
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setGroups(data.groups);
      setSelections(
        Object.fromEntries(data.groups.map((group) => [group.id, buildDefaultSelection(group)])),
      );
    } catch {
      if (requestId === loadRequestIdRef.current) {
        setLoadError("Could not load duplicate groups. Try again.");
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return () => {};
    }

    const timer = globalThis.window.setTimeout(() => {
      void loadGroups();
    }, 0);

    return () => {
      globalThis.window.clearTimeout(timer);
      loadRequestIdRef.current += 1;
    };
  }, [open, loadGroups]);

  const handlePrimaryChange = useCallback((groupId: string, relativePath: string) => {
    setSelections((prev) => {
      const current = prev[groupId];
      if (!current || current.primaryRelativePath === relativePath) {
        return prev;
      }

      const nextKeptRelativePaths = new Set(current.keptRelativePaths);
      nextKeptRelativePaths.add(current.primaryRelativePath);
      nextKeptRelativePaths.delete(relativePath);

      return {
        ...prev,
        [groupId]: { primaryRelativePath: relativePath, keptRelativePaths: nextKeptRelativePaths },
      };
    });
  }, []);

  const handleKeptToggle = useCallback(
    (groupId: string, relativePath: string, checked: boolean) => {
      setSelections((prev) => {
        const current = prev[groupId];
        if (!current) {
          return prev;
        }

        const nextKeptRelativePaths = new Set(current.keptRelativePaths);

        if (checked) {
          nextKeptRelativePaths.add(relativePath);
        } else {
          nextKeptRelativePaths.delete(relativePath);
        }

        return { ...prev, [groupId]: { ...current, keptRelativePaths: nextKeptRelativePaths } };
      });
    },
    [],
  );

  const handleValidate = useCallback(
    async (group: IDuplicateGroup) => {
      const selection = selections[group.id] ?? buildDefaultSelection(group);

      setValidatingGroupId(group.id);
      setGroupErrors((prev) => ({ ...prev, [group.id]: "" }));

      try {
        const response = await fetch("/api/duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primaryRelativePath: selection.primaryRelativePath,
            additionalKeptRelativePaths: [...selection.keptRelativePaths],
          }),
        });

        if (!response.ok) {
          setGroupErrors((prev) => ({
            ...prev,
            [group.id]: "Could not validate this group. Try again.",
          }));
          return;
        }

        setGroups((prev) => prev.filter((candidate) => candidate.id !== group.id));
        onChangesApplied?.();
      } catch {
        setGroupErrors((prev) => ({
          ...prev,
          [group.id]: "Could not validate this group. Try again.",
        }));
      } finally {
        setValidatingGroupId(null);
      }
    },
    [selections, onChangesApplied],
  );

  const handleRedrawPrimary = useCallback(
    async (group: IDuplicateGroup, primaryRelativePath: string) => {
      setRedrawingGroupId(group.id);
      setGroupErrors((prev) => ({ ...prev, [group.id]: "" }));

      try {
        const response = await fetch(`/api/image?path=${encodeURIComponent(primaryRelativePath)}`, {
          method: "PATCH",
        });

        if (!response.ok) {
          setGroupErrors((prev) => ({
            ...prev,
            [group.id]: "Could not redraw the primary image. Try again.",
          }));
          return;
        }

        await loadGroups();
        onChangesApplied?.();
      } catch {
        setGroupErrors((prev) => ({
          ...prev,
          [group.id]: "Could not redraw the primary image. Try again.",
        }));
      } finally {
        setRedrawingGroupId(null);
      }
    },
    [loadGroups, onChangesApplied],
  );

  const handleReject = useCallback((group: IDuplicateGroup) => {
    setPendingRejectGroup(group);
  }, []);

  const handleToggleExpand = useCallback((groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }, []);

  const handleRejectCancel = useCallback(() => {
    setPendingRejectGroup(null);
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    const group = pendingRejectGroup;
    if (!group) {
      return;
    }

    setValidatingGroupId(group.id);
    setGroupErrors((prev) => ({ ...prev, [group.id]: "" }));

    try {
      const response = await fetch("/api/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryRelativePath: group.images[0].relativePath,
          additionalKeptRelativePaths: [],
          rejectAll: true,
        }),
      });

      if (!response.ok) {
        setGroupErrors((prev) => ({
          ...prev,
          [group.id]: "Could not reject this group. Try again.",
        }));
        return;
      }

      setGroups((prev) => prev.filter((candidate) => candidate.id !== group.id));
      onChangesApplied?.();
    } catch {
      setGroupErrors((prev) => ({
        ...prev,
        [group.id]: "Could not reject this group. Try again.",
      }));
    } finally {
      setValidatingGroupId(null);
      setPendingRejectGroup(null);
    }
  }, [pendingRejectGroup, onChangesApplied]);

  const styleOptions = useMemo(
    () =>
      [...new Set(groups.map((group) => group.style))].sort((a, b) =>
        styleLabel(a).localeCompare(styleLabel(b), undefined, { sensitivity: "base" }),
      ),
    [groups, styleLabel],
  );

  // Once every group of the selected style has been resolved, that style drops out of
  // styleOptions (and the filter dropdown itself disappears once only one style remains) - so
  // fall back to "All styles" instead of leaving the filter stuck on a style with no groups left.
  const effectiveSelectedStyle =
    selectedStyle && styleOptions.includes(selectedStyle) ? selectedStyle : "";

  const visibleGroups = useMemo(
    () =>
      groups.filter((group) => !effectiveSelectedStyle || group.style === effectiveSelectedStyle),
    [groups, effectiveSelectedStyle],
  );

  const handleStyleFilterChange = useCallback((event: SelectChangeEvent) => {
    setSelectedStyle(event.target.value);
  }, []);

  const groupCount = groups.length;
  const visibleGroupCount = visibleGroups.length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth sx={DIALOG_SX}>
      <DialogTitle sx={DIALOG_TITLE_SX}>
        Duplicate Finder
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <Box sx={LOADING_SX}>
            <CircularProgress />
          </Box>
        )}

        {!isLoading && loadError && <Alert severity="error">{loadError}</Alert>}

        {!isLoading && !loadError && groupCount > 0 && styleOptions.length > 1 && (
          <Box sx={FILTER_BAR_SX}>
            <FormControl size="small" sx={STYLE_FILTER_SX}>
              <InputLabel id="duplicate-style-filter-label">Style</InputLabel>
              <Select
                labelId="duplicate-style-filter-label"
                value={effectiveSelectedStyle}
                label="Style"
                onChange={handleStyleFilterChange}
              >
                <MenuItem value="">All styles</MenuItem>
                {styleOptions.map((style) => (
                  <MenuItem key={style} value={style}>
                    {styleLabel(style)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {!isLoading && !loadError && groupCount === 0 && (
          <Box sx={EMPTY_STATE_SX}>
            <CheckCircleIcon fontSize="large" color="success" />
            <Typography variant="body1">No duplicates to review.</Typography>
          </Box>
        )}

        {!isLoading && !loadError && groupCount > 0 && visibleGroupCount === 0 && (
          <Box sx={EMPTY_STATE_SX}>
            <Typography variant="body1">No duplicate groups match this style.</Typography>
          </Box>
        )}

        {!isLoading &&
          !loadError &&
          visibleGroups.map((group, index) => (
            <DuplicateGroupCard
              key={group.id}
              group={group}
              selection={selections[group.id] ?? buildDefaultSelection(group)}
              isValidating={validatingGroupId === group.id}
              isRedrawing={redrawingGroupId === group.id}
              isLast={index === visibleGroupCount - 1}
              isExpanded={!collapsedGroupIds.has(group.id)}
              groupError={groupErrors[group.id]}
              styleLabel={styleLabel}
              onPrimaryChange={handlePrimaryChange}
              onKeptToggle={handleKeptToggle}
              onValidate={handleValidate}
              onReject={handleReject}
              onRedrawPrimary={handleRedrawPrimary}
              onToggleExpand={handleToggleExpand}
            />
          ))}
      </DialogContent>

      <Dialog open={pendingRejectGroup !== null} onClose={handleRejectCancel}>
        <DialogTitle>Reject group?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete all {pendingRejectGroup?.images.length} images in this
            group. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRejectCancel} disabled={validatingGroupId !== null}>
            Cancel
          </Button>
          <Button onClick={handleRejectConfirm} color="error" disabled={validatingGroupId !== null}>
            {validatingGroupId !== null ? <CircularProgress size={18} /> : "Reject group"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
