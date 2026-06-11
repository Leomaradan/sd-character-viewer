"use client";

import { Box, type SelectChangeEvent, Stack, TextField } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { IImageItem, IMetadataFilterOption, TStyle } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { StyleView } from "./StyleView";
import { useCallback, useMemo } from "react";
import { SearchField } from "./SearchField";
import { CategoryFilter } from "./CategoryFilter";

interface IStylesViewProps {
  styles: TStyle[];
  styleViewStyle: TStyle;
  styleViewSearchText: string;
  metadataFilterOptions: IMetadataFilterOption[];
  selectedMetadataFilterId: string;
  styleFilteredImages: IImageItem[];
  onStyleSelect: (style: TStyle) => void;
  onMetadataFilterChange: (event: SelectChangeEvent<string>) => void;
  onClearMetadataFilter: () => void;
  onStyleSearchTextChange: (value: string) => void;
  onImageSelect: (image: IImageItem) => void;
}

export const StylesView = ({
  styles,
  styleViewStyle,
  styleViewSearchText,
  metadataFilterOptions,
  selectedMetadataFilterId,
  styleFilteredImages,
  onStyleSelect,
  onMetadataFilterChange,
  onClearMetadataFilter,
  onStyleSearchTextChange,
  onImageSelect,
}: Readonly<IStylesViewProps>) => {
  const handleOnSearchTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onStyleSearchTextChange(event.target.value);
    },
    [onStyleSearchTextChange],
  );

  const textFieldSlotProps = useMemo(
    () => ({
      input: {
        endAdornment: styleViewSearchText ? (
          <SearchField onClear={onStyleSearchTextChange} label="style" />
        ) : undefined,
      },
    }),
    [styleViewSearchText, onStyleSearchTextChange],
  );

  return (
    <Stack spacing={2}>
      <Stack spacing={STACK_SPACING} direction="row" useFlexGap sx={FLEXWRAP}>
        {styles.map((style) => (
          <StyleView
            key={style}
            style={style}
            primary={styleViewStyle === style}
            onStyleSelect={onStyleSelect}
          />
        ))}
      </Stack>

      <TextField
        fullWidth
        label="Search character or pose"
        value={styleViewSearchText}
        onChange={handleOnSearchTextChange}
        placeholder="Type part of a character or pose name"
        slotProps={textFieldSlotProps}
      />

      <CategoryFilter
        metadataFilterOptions={metadataFilterOptions}
        selectedMetadataFilterId={selectedMetadataFilterId}
        onMetadataFilterChange={onMetadataFilterChange}
        onClearMetadataFilter={onClearMetadataFilter}
        prefix="style"
      />

      <Box sx={GRID}>
        {styleFilteredImages.map((image) => (
          <ImageCard key={image.id} image={image} onSelect={onImageSelect} />
        ))}
      </Box>
    </Stack>
  );
};
