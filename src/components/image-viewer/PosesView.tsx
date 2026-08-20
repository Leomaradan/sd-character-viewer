"use client";

import { Box, Chip, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { IImageItem, IMetadataFilterOption } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { useCallback, useMemo } from "react";
import { SearchField } from "./SearchField";
import { PoseView } from "./PoseView";
import { StyleView } from "./StyleView";
import { CategoryFilter } from "./CategoryFilter";

interface IPoseOption {
  value: string;
  label: string;
}

interface IPosesViewProps {
  styles: string[];
  styleLabel: (style: string) => string;
  poseViewPoseOptions: IPoseOption[];
  poseViewSelectedPoses: string[];
  poseViewStyle: string;
  poseViewCharacterSearch: string;
  metadataFilterOptions: IMetadataFilterOption[];
  selectedMetadataFilterId: string;
  poseFilteredImages: IImageItem[];
  showNewBadge: boolean;
  onClearPoses: () => void;
  onTogglePose: (pose: string) => void;
  onPoseStyleChange: (style: string) => void;
  onMetadataFilterChange: (event: SelectChangeEvent) => void;
  onClearMetadataFilter: () => void;
  onCharacterSearchChange: (value: string) => void;
  onImageSelect: (image: IImageItem) => void;
}

export const PosesView = ({
  styles,
  styleLabel,
  poseViewPoseOptions,
  poseViewSelectedPoses,
  poseViewStyle,
  poseViewCharacterSearch,
  metadataFilterOptions,
  selectedMetadataFilterId,
  poseFilteredImages,
  showNewBadge,
  onClearPoses,
  onTogglePose,
  onPoseStyleChange,
  onMetadataFilterChange,
  onClearMetadataFilter,
  onCharacterSearchChange,
  onImageSelect,
}: Readonly<IPosesViewProps>) => {
  const handleOnSearchTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onCharacterSearchChange(event.target.value);
    },
    [onCharacterSearchChange],
  );

  const handleSelectAllStyles = useCallback(() => {
    onPoseStyleChange("--all--");
  }, [onPoseStyleChange]);

  const textFieldSlotProps = useMemo(
    () => ({
      input: {
        endAdornment: poseViewCharacterSearch ? (
          <SearchField onClear={onCharacterSearchChange} label="character" />
        ) : undefined,
      },
    }),
    [poseViewCharacterSearch, onCharacterSearchChange],
  );

  return (
    <Stack spacing={2}>
      <Stack spacing={STACK_SPACING} direction="row" useFlexGap sx={FLEXWRAP}>
        <Chip
          label="All poses"
          color={poseViewSelectedPoses.length === 0 ? "primary" : "default"}
          onClick={onClearPoses}
        />
        {poseViewPoseOptions.map((poseOption) => (
          <PoseView
            key={poseOption.value}
            poseOption={poseOption}
            primary={poseViewSelectedPoses.includes(poseOption.value)}
            onTogglePose={onTogglePose}
          />
        ))}
      </Stack>

      <Stack spacing={STACK_SPACING} direction="row" useFlexGap sx={FLEXWRAP}>
        <Chip
          label="All styles"
          color={poseViewStyle === "--all--" ? "secondary" : "default"}
          onClick={handleSelectAllStyles}
        />
        {styles.map((style) => (
          <StyleView
            key={style}
            style={style}
            styleLabel={styleLabel}
            primary={poseViewStyle === style}
            onStyleSelect={onPoseStyleChange}
          />
        ))}
      </Stack>

      <TextField
        fullWidth
        label="Character contains"
        value={poseViewCharacterSearch}
        onChange={handleOnSearchTextChange}
        placeholder="Type part of a character name"
        slotProps={textFieldSlotProps}
      />

      <CategoryFilter
        metadataFilterOptions={metadataFilterOptions}
        selectedMetadataFilterId={selectedMetadataFilterId}
        onMetadataFilterChange={onMetadataFilterChange}
        onClearMetadataFilter={onClearMetadataFilter}
        prefix="pose"
      />

      <Box sx={GRID}>
        {poseFilteredImages.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            showNewBadge={showNewBadge}
            styleLabel={styleLabel}
            onSelect={onImageSelect}
          />
        ))}
      </Box>
    </Stack>
  );
};
