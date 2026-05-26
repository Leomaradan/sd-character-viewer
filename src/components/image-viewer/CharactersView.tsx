"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { ICharacterSummary, IImageItem, TStyle } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { useCallback } from "react";
import { StyleView } from "./StyleView";
import { PoseView } from "./PoseView";
import { CharacterView } from "./CharacterView";

interface ICharactersViewProps {
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

const WIDTH_FIT_CONTENT = { width: "fit-content" };

export const CharactersView = ({
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
}: Readonly<ICharactersViewProps>) => {
  const onCharacterDetailStyleChangeHandlerAll = useCallback(() => {
    onCharacterDetailStyleChange("all");
  }, [onCharacterDetailStyleChange]);

  const onCharacterDetailPoseChangeHandlerAll = useCallback(() => {
    onCharacterDetailPoseChange("all");
  }, [onCharacterDetailPoseChange]);

  const onBackToCharactersClick = useCallback(() => {
    onSelectCharacter(null);
  }, [onSelectCharacter]);

  return (
    <Stack spacing={2}>
      {selectedCharacter ? (
        <>
          <Stack spacing={STACK_SPACING} direction="row" useFlexGap sx={FLEXWRAP}>
            <Chip
              label="All styles"
              color={characterDetailStyle === "all" ? "primary" : "default"}
              onClick={onCharacterDetailStyleChangeHandlerAll}
            />
            {styles.map((style) => (
              <StyleView
                key={style}
                style={style}
                onStyleSelect={onCharacterDetailStyleChange}
                primary={characterDetailStyle === style}
              />
            ))}
          </Stack>

          <Stack spacing={STACK_SPACING} direction="row" useFlexGap sx={FLEXWRAP}>
            <Chip
              label="All poses"
              color={characterDetailPose === "all" ? "secondary" : "default"}
              onClick={onCharacterDetailPoseChangeHandlerAll}
            />
            {characterDetailPoseOptions.map((pose) => (
              <PoseView
                key={pose}
                poseOption={pose}
                primary={characterDetailPose === pose}
                onTogglePose={onCharacterDetailPoseChange}
              />
            ))}
          </Stack>

          <Chip
            label="Back to characters"
            variant="outlined"
            onClick={onBackToCharactersClick}
            sx={WIDTH_FIT_CONTENT}
          />

          <Typography variant="h6">{selectedCharacter}</Typography>

          <Box sx={GRID}>
            {visibleCharacterDetailImages.map((image) => (
              <ImageCard key={image.id} image={image} />
            ))}
          </Box>
        </>
      ) : (
        <Box sx={GRID}>
          {charactersForBrowseStyle.map((character) => (
            <CharacterView
              key={character.name}
              defaultStyle={defaultStyle}
              browseStyle={browseStyle}
              character={character}
              onSelectCharacter={onSelectCharacter}
            />
          ))}
        </Box>
      )}
    </Stack>
  );
};
