"use client";

import { Box, Chip, type SelectChangeEvent, Stack, Typography } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { ICharacterSummary, IImageItem, IMetadataFilterOption, TStyle } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { useCallback, useMemo } from "react";
import { StyleView } from "./StyleView";
import { PoseView } from "./PoseView";
import { CharacterView } from "./CharacterView";
import { CategoryFilter } from "./CategoryFilter";

interface ICharactersViewProps {
  styles: TStyle[];
  defaultStyle: TStyle;
  browseStyle: TStyle;
  selectedCharacter: string | null;
  onMetadataFilterChange: (event: SelectChangeEvent<string>) => void;
  onClearMetadataFilter: () => void;
  selectedMetadataFilterId: string;
  metadataFilterOptions: IMetadataFilterOption[];
  characterDetailStyle: "all" | TStyle;
  characterDetailPose: string;
  characterDetailPoseOptions: string[];
  charactersForBrowseStyle: ICharacterSummary[];
  visibleCharacterDetailImages: IImageItem[];
  showNewBadge: boolean;
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
  selectedMetadataFilterId,
  characterDetailStyle,
  characterDetailPose,
  characterDetailPoseOptions,
  charactersForBrowseStyle,
  visibleCharacterDetailImages,
  showNewBadge,
  onSelectCharacter,
  onMetadataFilterChange,
  onClearMetadataFilter,
  onCharacterDetailStyleChange,
  onCharacterDetailPoseChange,
  onImageSelect,
  metadataFilterOptions,
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

  const metadataFilterById = useMemo(() => {
    return new Map(metadataFilterOptions.map((option) => [option.id, option]));
  }, [metadataFilterOptions]);

  const effectiveSelectedMetadataFilterId = useMemo(() => {
    if (!selectedMetadataFilterId) {
      return "";
    }

    return metadataFilterById.has(selectedMetadataFilterId) ? selectedMetadataFilterId : "";
  }, [selectedMetadataFilterId, metadataFilterById]);

  const filteredCharacters = useMemo(() => {
    const selectedOption = metadataFilterById.get(effectiveSelectedMetadataFilterId);

    if (!selectedOption) {
      return charactersForBrowseStyle;
    }

    return charactersForBrowseStyle.filter((character) => {
      if (selectedOption.type === "category") {
        return character.category === selectedOption.value;
      }

      if (selectedOption.type === "tag") {
        return character.tags.includes(selectedOption.value);
      }

      return character.serie === selectedOption.value;
    });
  }, [charactersForBrowseStyle, effectiveSelectedMetadataFilterId, metadataFilterById]);

  const groupedCharacters = useMemo((): ICharacterGroup[] => {
    const map = new Map<string, ICharacterSummary[]>();
    for (const character of filteredCharacters) {
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
  }, [filteredCharacters]);

  const showAzBar = groupedCharacters.length > 1;
  const hasActiveMetadataFilters = Boolean(effectiveSelectedMetadataFilterId);

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
              <ImageCard
                key={image.id}
                image={image}
                showNewBadge={showNewBadge}
                onSelect={onImageSelect}
              />
            ))}
          </Box>
        </>
      ) : (
        <>
          <CategoryFilter
            metadataFilterOptions={metadataFilterOptions}
            selectedMetadataFilterId={effectiveSelectedMetadataFilterId}
            onMetadataFilterChange={onMetadataFilterChange}
            onClearMetadataFilter={onClearMetadataFilter}
            prefix="character"
          />

          {!hasActiveMetadataFilters && showAzBar && (
            <Box sx={AZ_BAR_SX}>
              {groupedCharacters.map(({ letter }) => (
                <LetterChip key={letter} letter={letter} />
              ))}
            </Box>
          )}
          {hasActiveMetadataFilters ? (
            <Box sx={GRID}>
              {filteredCharacters.map((character) => (
                <CharacterView
                  key={character.name}
                  defaultStyle={defaultStyle}
                  browseStyle={browseStyle}
                  character={character}
                  onSelectCharacter={onSelectCharacter}
                />
              ))}
            </Box>
          ) : (
            groupedCharacters.map(({ letter, characters }) => (
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
            ))
          )}
          {groupedCharacters.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No characters match the selected metadata filters.
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
};
