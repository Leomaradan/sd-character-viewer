"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

import type { IImageItem } from "@/types/library";

import { formatStyleLabel } from "@/components/image-viewer/common/utils";
import { LazyImage } from "@/components/image-viewer/image/LazyImage";

import { GRID } from "../common/constants";

interface IPoseConformityModalProps {
  open: boolean;
  onClose: () => void;
  onChangesApplied?: () => void;
  styleLabel?: (style: string) => string;
}

interface IPoseConformityResponse {
  standardPoses: string[];
  items: IImageItem[];
}

const PREVIEW_SX = {
  width: "100%",
  aspectRatio: "3 / 4",
  borderBottom: "1px solid",
  borderColor: "divider",
};
const LOADING_SX = { display: "flex", justifyContent: "center", py: 6 };
const FILE_NAME_SX = { wordBreak: "break-word" };
const BUTTONS_SX = { flexWrap: "wrap", gap: 0.5, mt: 1 };
const ERROR_SX = { mt: 1, fontSize: "0.75rem" };

const getFileName = (relativePath: string): string => relativePath.split("/").pop() ?? "";

interface IPoseButtonProps {
  pose: string;
  disabled: boolean;
  onPick: (pose: string) => void;
}

const PoseButton = ({ pose, disabled, onPick }: Readonly<IPoseButtonProps>) => {
  const handleClick = useCallback(() => {
    onPick(pose);
  }, [onPick, pose]);

  return (
    <Button size="small" variant="outlined" onClick={handleClick} disabled={disabled}>
      {pose}
    </Button>
  );
};

interface IPoseConformityCardProps {
  item: IImageItem;
  standardPoses: string[];
  isPending: boolean;
  error: string | undefined;
  styleLabel: (style: string) => string;
  onPickPose: (item: IImageItem, pose: string) => void;
  onMarkCustom: (item: IImageItem) => void;
}

const PoseConformityCard = ({
  item,
  standardPoses,
  isPending,
  error,
  styleLabel,
  onPickPose,
  onMarkCustom,
}: Readonly<IPoseConformityCardProps>) => {
  const handlePick = useCallback(
    (pose: string) => {
      onPickPose(item, pose);
    },
    [item, onPickPose],
  );

  const handleCustom = useCallback(() => {
    onMarkCustom(item);
  }, [item, onMarkCustom]);

  return (
    <Card elevation={1}>
      <LazyImage
        relativePath={item.relativePath}
        alt={`${item.characterName} ${item.poseName}`}
        sx={PREVIEW_SX}
        modifiedAt={item.modifiedAt}
        mode="preview"
      />
      <CardContent>
        <Typography variant="subtitle2" noWrap>
          {item.characterName} · {styleLabel(item.style)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={FILE_NAME_SX}>
          {getFileName(item.relativePath)}
        </Typography>
        <Stack direction="row" useFlexGap sx={BUTTONS_SX}>
          {standardPoses.map((pose) => (
            <PoseButton key={pose} pose={pose} disabled={isPending} onPick={handlePick} />
          ))}
          <Button
            size="small"
            variant="contained"
            color="secondary"
            onClick={handleCustom}
            disabled={isPending}
          >
            {isPending ? <CircularProgress size={16} /> : "Custom"}
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={ERROR_SX}>
            {error}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

// Lists every image/video whose pose isn't one of config.json's standard poses. Each card offers
// one button per standard pose (renames the file to match it) and "Custom" (keeps the name and
// stops listing it); a handled card disappears from the list.
export function PoseConformityModal({
  open,
  onClose,
  onChangesApplied,
  styleLabel = formatStyleLabel,
}: Readonly<IPoseConformityModalProps>) {
  const [items, setItems] = useState<IImageItem[]>([]);
  const [standardPoses, setStandardPoses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingPaths, setPendingPaths] = useState<ReadonlySet<string>>(new Set());
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  // Bumped on every load and whenever the dialog closes, so a stale response is ignored.
  const loadRequestIdRef = useRef(0);

  const loadItems = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch("/api/pose-conformity", { cache: "no-store" });
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setLoadError("Could not check the library's poses. Try again.");
        return;
      }

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const data = (await response.json()) as IPoseConformityResponse;
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setItems(data.items);
      setStandardPoses(data.standardPoses);
      setItemErrors({});
    } catch {
      if (requestId === loadRequestIdRef.current) {
        setLoadError("Could not check the library's poses. Try again.");
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
      void loadItems();
    }, 0);

    return () => {
      globalThis.window.clearTimeout(timer);
      loadRequestIdRef.current += 1;
    };
  }, [open, loadItems]);

  const submit = useCallback(
    async (item: IImageItem, body: Record<string, unknown>) => {
      const { relativePath } = item;
      setPendingPaths((current) => new Set(current).add(relativePath));
      setItemErrors(({ [relativePath]: _removed, ...rest }) => rest);

      try {
        const response = await fetch("/api/pose-conformity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: relativePath, ...body }),
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          setItemErrors((current) => ({
            ...current,
            [relativePath]: message || "Could not update this file. Try again.",
          }));
          return;
        }

        setItems((current) => current.filter((entry) => entry.relativePath !== relativePath));
        onChangesApplied?.();
      } catch {
        setItemErrors((current) => ({
          ...current,
          [relativePath]: "Could not update this file. Try again.",
        }));
      } finally {
        setPendingPaths((current) => {
          const next = new Set(current);
          next.delete(relativePath);
          return next;
        });
      }
    },
    [onChangesApplied],
  );

  const handlePickPose = useCallback(
    (item: IImageItem, pose: string) => {
      void submit(item, { pose });
    },
    [submit],
  );

  const handleMarkCustom = useCallback(
    (item: IImageItem) => {
      void submit(item, { custom: true });
    },
    [submit],
  );

  let content;
  if (isLoading) {
    content = (
      <Box sx={LOADING_SX}>
        <CircularProgress />
      </Box>
    );
  } else if (loadError) {
    content = <Alert severity="error">{loadError}</Alert>;
  } else if (items.length === 0) {
    content = (
      <Typography variant="body2" color="text.secondary">
        Every image and video matches a standard pose.
      </Typography>
    );
  } else {
    content = (
      <Box sx={GRID}>
        {items.map((item) => (
          <PoseConformityCard
            key={item.relativePath}
            item={item}
            standardPoses={standardPoses}
            isPending={pendingPaths.has(item.relativePath)}
            error={itemErrors[item.relativePath]}
            styleLabel={styleLabel}
            onPickPose={handlePickPose}
            onMarkCustom={handleMarkCustom}
          />
        ))}
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Pose Conformity
        {!isLoading && !loadError && items.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {items.length} {items.length === 1 ? "file doesn't" : "files don't"} match a standard
            pose
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>{content}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
