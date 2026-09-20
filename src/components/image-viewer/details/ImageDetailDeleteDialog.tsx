"use client";

import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useCallback } from "react";

interface IImageDetailDeleteDialogProps {
  open: boolean;
  isVideo: boolean;
  fileName: string;
  characterName: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ImageDetailDeleteDialog({
  open,
  isVideo,
  fileName,
  characterName,
  isDeleting,
  onClose,
  onConfirm,
}: Readonly<IImageDetailDeleteDialogProps>) {
  const handleClose = useCallback(() => {
    // Ignore backdrop-click/Escape while a delete is in flight - it isn't cancelable (the
    // fetch keeps running), so closing here would just hide the dialog and let the user
    // believe the delete didn't happen.
    if (isDeleting) {
      return;
    }
    onClose();
  }, [isDeleting, onClose]);

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>{isVideo ? "Delete video?" : "Delete image?"}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will permanently delete <strong>{fileName}</strong> for{" "}
          <strong>{characterName}</strong>. This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button onClick={onConfirm} color="error" disabled={isDeleting}>
          {isDeleting ? <CircularProgress size={18} /> : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
