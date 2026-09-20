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
  return (
    <Dialog open={open} onClose={onClose}>
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
