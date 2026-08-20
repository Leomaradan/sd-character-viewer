"use client";

import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Radio,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { IDuplicateGroup, IImageItem } from "@/types/library";
import { LazyImage } from "@/components/image-viewer/image/LazyImage";
import { formatStyleLabel } from "@/components/image-viewer/utils";

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
const GROUP_BOX_SX = { pb: 3, mb: 3 };
const GROUP_HEADER_SX = { mb: 1.5 };
const GROUP_TITLE_SX = { fontWeight: 600 };
const GROUP_SUBTITLE_SX = { opacity: 0.7 };
const IMAGES_ROW_SX = {
  display: "flex",
  flexWrap: "wrap",
  gap: 2,
};
const IMAGE_ITEM_SX = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};
const IMAGE_THUMB_SX = { width: "100%", aspectRatio: "3 / 4", borderRadius: 1, overflow: "hidden" };
const IMAGE_FILL_SX = { width: "100%", height: "100%" };
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
  onPrimaryChange: (groupId: string, relativePath: string) => void;
  onKeptToggle: (groupId: string, relativePath: string, checked: boolean) => void;
}

const DuplicateImageItem = ({
  image,
  groupId,
  isPrimary,
  isKept,
  isValidating,
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
          mode="magnifier"
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
  isLast: boolean;
  groupError?: string;
  styleLabel: (style: string) => string;
  onPrimaryChange: (groupId: string, relativePath: string) => void;
  onKeptToggle: (groupId: string, relativePath: string, checked: boolean) => void;
  onValidate: (group: IDuplicateGroup) => void;
}

const DuplicateGroupCard = ({
  group,
  selection,
  isValidating,
  isLast,
  groupError,
  styleLabel,
  onPrimaryChange,
  onKeptToggle,
  onValidate,
}: Readonly<IDuplicateGroupCardProps>) => {
  const handleValidateClick = useCallback(() => {
    onValidate(group);
  }, [onValidate, group]);

  return (
    <Box sx={GROUP_BOX_SX}>
      <Box sx={GROUP_HEADER_SX}>
        <Typography variant="subtitle1" sx={GROUP_TITLE_SX}>
          {group.characterName} - {group.poseBaseName}
        </Typography>
        <Typography variant="body2" sx={GROUP_SUBTITLE_SX}>
          {styleLabel(group.style)} - {group.images.length} images
        </Typography>
      </Box>

      <Box sx={IMAGES_ROW_SX}>
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
              isValidating={isValidating}
              onPrimaryChange={onPrimaryChange}
              onKeptToggle={onKeptToggle}
            />
          );
        })}
      </Box>

      <Box sx={GROUP_ACTIONS_SX}>
        <Button variant="contained" onClick={handleValidateClick} disabled={isValidating}>
          {isValidating ? <CircularProgress size={18} /> : "Validate"}
        </Button>
      </Box>

      {groupError && (
        <Alert severity="error" sx={GROUP_ERROR_SX}>
          {groupError}
        </Alert>
      )}

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
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
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

  const groupCount = groups.length;

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

        {!isLoading && !loadError && groupCount === 0 && (
          <Box sx={EMPTY_STATE_SX}>
            <CheckCircleIcon fontSize="large" color="success" />
            <Typography variant="body1">No duplicates to review.</Typography>
          </Box>
        )}

        {!isLoading &&
          !loadError &&
          groups.map((group, index) => (
            <DuplicateGroupCard
              key={group.id}
              group={group}
              selection={selections[group.id] ?? buildDefaultSelection(group)}
              isValidating={validatingGroupId === group.id}
              isLast={index === groupCount - 1}
              groupError={groupErrors[group.id]}
              styleLabel={styleLabel}
              onPrimaryChange={handlePrimaryChange}
              onKeptToggle={handleKeptToggle}
              onValidate={handleValidate}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}
