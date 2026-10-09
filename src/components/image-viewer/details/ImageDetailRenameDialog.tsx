"use client";

import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
} from "@mui/material";
import { useCallback, useState, type ChangeEvent, type SubmitEvent } from "react";

interface IImageDetailRenameDialogProps {
  open: boolean;
  isVideo: boolean;
  relativePath: string;
  onClose: () => void;
  onRenamed: (newRelativePath: string) => void;
}

const FORM_SX = { pt: 1 };
const TEXT_FIELD_SX = { mt: 1, minWidth: { sm: 400 } };

const splitFileName = (relativePath: string): { stem: string; extension: string } => {
  const fileName = relativePath.split("/").pop() ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0
    ? { stem: fileName.slice(0, extensionIndex), extension: fileName.slice(extensionIndex) }
    : { stem: fileName, extension: "" };
};

// Owns its own draft/error/saving state (rather than lifting it into ImageDetailModal) since none
// of it matters outside the dialog; the parent remounts it per file via `key` so the draft always
// starts from the current name.
export function ImageDetailRenameDialog({
  open,
  isVideo,
  relativePath,
  onClose,
  onRenamed,
}: Readonly<IImageDetailRenameDialogProps>) {
  const { stem, extension } = splitFileName(relativePath);
  const [draft, setDraft] = useState(stem);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = useCallback(() => {
    if (isSaving) {
      return;
    }
    setError(null);
    setDraft(stem);
    onClose();
  }, [isSaving, onClose, stem]);

  const handleDraftChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const newName = draft.trim();

      if (newName === "") {
        setError("The name can't be empty.");
        return;
      }

      setIsSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/image?path=${encodeURIComponent(relativePath)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newName }),
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          setError(message || "Could not rename the file. Try again.");
          return;
        }

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const { newPath } = (await response.json()) as { newPath: string };
        onRenamed(newPath);
      } catch {
        setError("Could not rename the file. Try again.");
      } finally {
        setIsSaving(false);
      }
    },
    [draft, relativePath, onRenamed],
  );

  return (
    <Dialog open={open} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{isVideo ? "Rename video" : "Rename image"}</DialogTitle>
        <DialogContent sx={FORM_SX}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={draft}
            onChange={handleDraftChange}
            disabled={isSaving}
            sx={TEXT_FIELD_SX}
            slotProps={{
              input: { endAdornment: <InputAdornment position="end">{extension}</InputAdornment> },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSaving || draft.trim() === stem}>
            {isSaving ? <CircularProgress size={18} /> : "Rename"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
