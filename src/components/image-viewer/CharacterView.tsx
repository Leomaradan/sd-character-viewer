"use client";

import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import { LazyImage } from "@/components/image-viewer/LazyImage";
import { formatStyleLabel } from "@/components/image-viewer/utils";
import type { ICharacterSummary, IImageItem, TStyle } from "@/types/library";

interface ICharacterViewProps {
  styles: TStyle[];
  defaultStyle: TStyle;
  browseStyle: TStyle;
  selectedCharacter: string | null;
  characterDetailStyle: "all" | TStyle;
  characterDetailPose: string;
  characterDetailPoseOptions: string[];
  charactersForBrowseStyle: ICharacterSummary[];
  visibleCharacterDetailImages: IImageItem[];
  onSelectCharacter: (characterName: string | null) => void;
  onCharacterDetailStyleChange: (style: "all" | TStyle) => void;
  onCharacterDetailPoseChange: (pose: string) => void;
}

export function CharacterView({
  styles,
  defaultStyle,
  browseStyle,
  selectedCharacter,
  characterDetailStyle,
  characterDetailPose,
  characterDetailPoseOptions,
  charactersForBrowseStyle,
  visibleCharacterDetailImages,
  onSelectCharacter,
  onCharacterDetailStyleChange,
  onCharacterDetailPoseChange,
}: Readonly<ICharacterViewProps>) {
  return (
    <Stack spacing={2}>
      {selectedCharacter ? (
        <>
          <Stack spacing={{ xs: 1, sm: 2 }} direction="row" useFlexGap sx={{ flexWrap: "wrap" }}>
            <Chip
              label="All styles"
              color={characterDetailStyle === "all" ? "primary" : "default"}
              onClick={() => onCharacterDetailStyleChange("all")}
            />
            {styles.map((style) => (
              <Chip
                key={style}
                label={formatStyleLabel(style)}
                color={characterDetailStyle === style ? "primary" : "default"}
                onClick={() => onCharacterDetailStyleChange(style)}
              />
            ))}
          </Stack>

          <Stack spacing={{ xs: 1, sm: 2 }} direction="row" useFlexGap sx={{ flexWrap: "wrap" }}>
            <Chip
              label="All poses"
              color={characterDetailPose === "all" ? "secondary" : "default"}
              onClick={() => onCharacterDetailPoseChange("all")}
            />
            {characterDetailPoseOptions.map((pose) => (
              <Chip
                key={pose}
                label={pose}
                color={characterDetailPose === pose ? "secondary" : "default"}
                onClick={() => onCharacterDetailPoseChange(pose)}
              />
            ))}
          </Stack>

          <Chip
            label="Back to characters"
            variant="outlined"
            onClick={() => onSelectCharacter(null)}
            sx={{ width: "fit-content" }}
          />

          <Typography variant="h6">{selectedCharacter}</Typography>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {visibleCharacterDetailImages.map((image) => (
              <ImageCard key={image.id} image={image} />
            ))}
          </Box>
        </>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {charactersForBrowseStyle.map((character) => {
            const thumbnailPath =
              character.thumbnailsByStyle[browseStyle] ??
              character.thumbnailsByStyle[defaultStyle] ??
              Object.values(character.thumbnailsByStyle)[0];

            return (
              <Card key={character.name}>
                <CardActionArea onClick={() => onSelectCharacter(character.name)}>
                  <Box
                    sx={{
                      width: "100%",
                      aspectRatio: "3 / 4",
                      bgcolor: "grey.100",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {thumbnailPath ? (
                      <LazyImage
                        relativePath={thumbnailPath}
                        alt={`${character.name} base`}
                        sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No Base image
                      </Typography>
                    )}
                  </Box>
                  <CardContent>
                    <Typography variant="subtitle1" noWrap>
                      {character.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {character.imageCount} images
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
