"use client";

import { ToggleButton } from "@mui/material";
import { useCallback } from "react";

interface IPendingActionFilterProps {
  withAction: boolean;
  onWithActionChange: (withAction: boolean) => void;
}

// On: only files waiting on an Upscale/Animate/Extend mark.
export const PendingActionFilter = ({
  withAction,
  onWithActionChange,
}: Readonly<IPendingActionFilterProps>) => {
  const handleChange = useCallback(() => {
    onWithActionChange(!withAction);
  }, [withAction, onWithActionChange]);

  return (
    <ToggleButton value="with-action" size="small" selected={withAction} onChange={handleChange}>
      With action
    </ToggleButton>
  );
};
