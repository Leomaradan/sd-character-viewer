"use client";

import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { type ChangeEvent } from "react";

const EDIT_PROMPT_ERROR_SX = { mb: 2 };
const EDIT_PROMPT_FIELD_SX = { mt: 1 };

interface IImageDetailEditPromptDialogProps {
  open: boolean;
  error: string | null;
  draft: string;
  isSaving: boolean;
  onDraftChange: (draft: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function ImageDetailEditPromptDialog({
  open,
  error,
  draft,
  isSaving,
  onDraftChange,
  onClose,
  onSave,
}: Readonly<IImageDetailEditPromptDialogProps>) {
  const handleDraftChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onDraftChange(event.target.value);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Animation Prompt</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={EDIT_PROMPT_ERROR_SX}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          multiline
          fullWidth
          minRows={3}
          label="Prompt"
          value={draft}
          onChange={handleDraftChange}
          sx={EDIT_PROMPT_FIELD_SX}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
