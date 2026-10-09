"use client";

import CloseIcon from "@mui/icons-material/Close";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { useCallback, type ReactNode } from "react";

export interface ILibraryTool {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  onOpen: () => void;
}

interface ILibraryToolboxModalProps {
  open: boolean;
  onClose: () => void;
  tools: ILibraryTool[];
}

const TITLE_SX = { pr: 6 };
const CLOSE_BUTTON_SX = { position: "absolute", right: 8, top: 8 };
const CONTENT_SX = { pt: 0 };
const TOOL_BUTTON_SX = { borderRadius: 1 };

interface ILibraryToolItemProps {
  tool: ILibraryTool;
  onSelect: (tool: ILibraryTool) => void;
}

const LibraryToolItem = ({ tool, onSelect }: Readonly<ILibraryToolItemProps>) => {
  const handleClick = useCallback(() => {
    onSelect(tool);
  }, [onSelect, tool]);

  return (
    <ListItemButton onClick={handleClick} sx={TOOL_BUTTON_SX}>
      <ListItemIcon>{tool.icon}</ListItemIcon>
      <ListItemText primary={tool.name} secondary={tool.description} />
    </ListItemButton>
  );
};

// Entry point for the library-maintenance tools (Duplicate Finder, ...): picking a tool closes
// the toolbox and hands over to that tool's own modal, so only one dialog is ever open.
export const LibraryToolboxModal = ({
  open,
  onClose,
  tools,
}: Readonly<ILibraryToolboxModalProps>) => {
  const handleSelect = useCallback(
    (tool: ILibraryTool) => {
      onClose();
      tool.onOpen();
    },
    [onClose],
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={TITLE_SX}>Library Toolbox</DialogTitle>
      <IconButton aria-label="Close" onClick={onClose} sx={CLOSE_BUTTON_SX}>
        <CloseIcon />
      </IconButton>
      <DialogContent sx={CONTENT_SX}>
        <List disablePadding>
          {tools.map((tool) => (
            <LibraryToolItem key={tool.id} tool={tool} onSelect={handleSelect} />
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
};
