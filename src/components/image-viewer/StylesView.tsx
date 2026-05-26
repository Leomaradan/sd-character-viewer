"use client";

import { Box, Stack, TextField } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { IImageItem, TStyle } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { StyleView } from "./StyleView";
import { useCallback, useMemo } from "react";
import { SearchField } from "./SearchField";

interface IStylesViewProps {
  styles: TStyle[];
  styleViewStyle: TStyle;
  styleViewSearchText: string;
  styleFilteredImages: IImageItem[];
  onStyleSelect: (style: TStyle) => void;
  onStyleSearchTextChange: (value: string) => void;
}

export const StylesView = ({
  styles,
  styleViewStyle,
  styleViewSearchText,
  styleFilteredImages,
  onStyleSelect,
  onStyleSearchTextChange,
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

      <Box sx={GRID}>
        {styleFilteredImages.map((image) => (
          <ImageCard key={image.id} image={image} />
        ))}
      </Box>
    </Stack>
  );
};
