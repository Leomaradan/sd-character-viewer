"use client";

import CloseIcon from "@mui/icons-material/Close";
import { Box, Chip, IconButton, InputAdornment, Stack, TextField } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import { formatStyleLabel } from "@/components/image-viewer/utils";
import type { IImageItem, TStyle } from "@/types/library";

interface IStyleViewProps {
  styles: TStyle[];
  styleViewStyle: TStyle;
  styleViewSearchText: string;
  styleFilteredImages: IImageItem[];
  onStyleSelect: (style: TStyle) => void;
  onStyleSearchTextChange: (value: string) => void;
}

export function StyleView({
  styles,
  styleViewStyle,
  styleViewSearchText,
  styleFilteredImages,
  onStyleSelect,
  onStyleSearchTextChange,
}: Readonly<IStyleViewProps>) {
  return (
    <Stack spacing={2}>
      <Stack spacing={{ xs: 1, sm: 2 }} direction="row" useFlexGap sx={{ flexWrap: "wrap" }}>
        {styles.map((style) => (
          <Chip
            key={style}
            label={formatStyleLabel(style)}
            color={styleViewStyle === style ? "primary" : "default"}
            onClick={() => onStyleSelect(style)}
          />
        ))}
      </Stack>

      <TextField
        fullWidth
        label="Search character or pose"
        value={styleViewSearchText}
        onChange={(event) => onStyleSearchTextChange(event.target.value)}
        placeholder="Type part of a character or pose name"
        slotProps={{
          input: {
            endAdornment: styleViewSearchText ? (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  size="small"
                  aria-label="Clear style search"
                  onClick={() => onStyleSearchTextChange("")}
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
        {styleFilteredImages.map((image) => (
          <ImageCard key={image.id} image={image} />
        ))}
      </Box>
    </Stack>
  );
}
