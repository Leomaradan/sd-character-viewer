"use client";

import { Chip } from "@mui/material";
import { useCallback } from "react";

interface IPoseOption {
  value: string;
  label: string;
}

interface IPoseViewProps {
  poseOption: IPoseOption | string;
  primary: boolean;

  onTogglePose: (pose: string) => void;
}

export const PoseView = ({ poseOption, primary, onTogglePose }: Readonly<IPoseViewProps>) => {
  const pose = typeof poseOption === "string" ? poseOption : poseOption.value;

  const handleOnClick = useCallback(() => {
    onTogglePose(pose);
  }, [onTogglePose, pose]);

  return (
    <Chip
      label={typeof poseOption === "string" ? poseOption : poseOption.label}
      color={primary ? "primary" : "default"}
      onClick={handleOnClick}
    />
  );
};
