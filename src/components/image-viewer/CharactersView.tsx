"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { ICharacterSummary, IImageItem, TStyle } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { useCallback, useMemo } from "react";
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
  onImageSelect: (image: IImageItem) => void;
}

const WIDTH_FIT_CONTENT = { width: "fit-content" };
const AZ_BAR_SX = { display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 };
const AZ_CHIP_SX = { fontWeight: 700 };
const SECTION_SX = { scrollMarginTop: { xs: "64px", sm: "8px" }, mb: 3 };
const SECTION_LETTER_SX = {
  display: "block",
  color: "text.secondary",
  fontWeight: 700,
  letterSpacing: 2,
  mb: 1,
};

interface ICharacterGroup {
  letter: string;
  characters: ICharacterSummary[];
}

const LETTER_REGEX = /[A-Z]/;

const getGroupLetter = (name: string): string => {
  const first = name.charAt(0).toUpperCase();
  return LETTER_REGEX.test(first) ? first : "#";
};

interface ILetterChipProps {
  letter: string;
}

const LetterChip = ({ letter }: Readonly<ILetterChipProps>) => {
  const handleClick = useCallback(() => {
    document
      .getElementById(`section-${letter}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [letter]);

  return (
    <Chip label={letter} size="small" variant="outlined" onClick={handleClick} sx={AZ_CHIP_SX} />
  );
};

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
  onImageSelect,
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

  const groupedCharacters = useMemo((): ICharacterGroup[] => {
    const map = new Map<string, ICharacterSummary[]>();
    for (const character of charactersForBrowseStyle) {
      const letter = getGroupLetter(character.name);
      const existing = map.get(letter);
      if (existing) {
        existing.push(character);
      } else {
        map.set(letter, [character]);
      }
    }
    const letters = [...map.keys()].sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
    return letters.map((letter) => ({ letter, characters: map.get(letter)! }));
  }, [charactersForBrowseStyle]);

  const showAzBar = groupedCharacters.length > 1;

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
              <ImageCard key={image.id} image={image} onSelect={onImageSelect} />
            ))}
          </Box>
        </>
      ) : (
        <>
          {showAzBar && (
            <Box sx={AZ_BAR_SX}>
              {groupedCharacters.map(({ letter }) => (
                <LetterChip key={letter} letter={letter} />
              ))}
            </Box>
          )}
          {groupedCharacters.map(({ letter, characters }) => (
            <Box key={letter} id={`section-${letter}`} sx={SECTION_SX}>
              {showAzBar && (
                <Typography variant="overline" sx={SECTION_LETTER_SX}>
                  {letter}
                </Typography>
              )}
              <Box sx={GRID}>
                {characters.map((character) => (
                  <CharacterView
                    key={character.name}
                    defaultStyle={defaultStyle}
                    browseStyle={browseStyle}
                    character={character}
                    onSelectCharacter={onSelectCharacter}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </>
      )}
    </Stack>
  );
};
