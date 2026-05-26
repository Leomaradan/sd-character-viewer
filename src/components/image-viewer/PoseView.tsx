"use client";

import CloseIcon from "@mui/icons-material/Close";
import { Box, Chip, IconButton, InputAdornment, Stack, TextField } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import { formatStyleLabel } from "@/components/image-viewer/utils";
import type { IImageItem, TStyle } from "@/types/library";

interface IPoseOption {
  value: string;
  label: string;
}

interface IPoseViewProps {
  styles: TStyle[];
  poseViewPoseOptions: IPoseOption[];
  poseViewSelectedPoses: string[];
  poseViewStyle: "all" | TStyle;
  poseViewCharacterSearch: string;
  poseFilteredImages: IImageItem[];
  onClearPoses: () => void;
  onTogglePose: (pose: string) => void;
  onPoseStyleChange: (style: "all" | TStyle) => void;
  onCharacterSearchChange: (value: string) => void;
}

export function PoseView({
  styles,
  poseViewPoseOptions,
  poseViewSelectedPoses,
  poseViewStyle,
  poseViewCharacterSearch,
  poseFilteredImages,
  onClearPoses,
  onTogglePose,
  onPoseStyleChange,
  onCharacterSearchChange,
}: Readonly<IPoseViewProps>) {
  return (
    <Stack spacing={2}>
      <Stack spacing={{ xs: 1, sm: 2 }} direction="row" useFlexGap sx={{ flexWrap: "wrap" }}>
        <Chip
          label="All poses"
          color={poseViewSelectedPoses.length === 0 ? "primary" : "default"}
          onClick={onClearPoses}
        />
        {poseViewPoseOptions.map((poseOption) => (
          <Chip
            key={poseOption.value}
            label={poseOption.label}
            color={poseViewSelectedPoses.includes(poseOption.value) ? "primary" : "default"}
            onClick={() => onTogglePose(poseOption.value)}
          />
        ))}
      </Stack>

      <Stack spacing={{ xs: 1, sm: 2 }} direction="row" useFlexGap sx={{ flexWrap: "wrap" }}>
        <Chip
          label="All styles"
          color={poseViewStyle === "all" ? "secondary" : "default"}
          onClick={() => onPoseStyleChange("all")}
        />
        {styles.map((style) => (
          <Chip
            key={style}
            label={formatStyleLabel(style)}
            color={poseViewStyle === style ? "secondary" : "default"}
            onClick={() => onPoseStyleChange(style)}
          />
        ))}
      </Stack>

      <TextField
        fullWidth
        label="Character contains"
        value={poseViewCharacterSearch}
        onChange={(event) => onCharacterSearchChange(event.target.value)}
        placeholder="Type part of a character name"
        slotProps={{
          input: {
            endAdornment: poseViewCharacterSearch ? (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  size="small"
                  aria-label="Clear character search"
                  onClick={() => onCharacterSearchChange("")}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {poseFilteredImages.map((image) => (
          <ImageCard key={image.id} image={image} />
        ))}
      </Box>
    </Stack>
  );
}
