"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";
import { ImageCard } from "@/components/image-viewer/ImageCard";
import type { ICharacterSummary, IImageItem, TStyle } from "@/types/library";
import { FLEXWRAP, GRID, STACK_SPACING } from "./constants";
import { useCallback, useMemo, useState } from "react";
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
const FILTERS_SX = { display: "flex", flexWrap: "wrap", gap: 1, mb: 2 };
const FILTER_TITLE_SX = { color: "text.secondary", fontWeight: 700, mb: 0.5 };
const QUICK_FILTERS_CONTAINER_SX = { mb: 2 };
const QUICK_FILTERS_HEADER_SX = { ...FLEXWRAP, alignItems: "center" };
const FILTER_SECTION_SX = { mt: 1 };

const compareNatural = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
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

interface IToggleFilterChipProps {
  label: string;
  selected: boolean;
  color: "primary" | "secondary";
  onToggle: (value: string) => void;
}

const ToggleFilterChip = ({
  label,
  selected,
  color,
  onToggle,
}: Readonly<IToggleFilterChipProps>) => {
  const handleClick = useCallback(() => {
    onToggle(label);
  }, [label, onToggle]);

  return <Chip label={label} color={selected ? color : "default"} onClick={handleClick} />;
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSerie, setSelectedSerie] = useState<string | null>(null);

  const onCharacterDetailStyleChangeHandlerAll = useCallback(() => {
    onCharacterDetailStyleChange("all");
  }, [onCharacterDetailStyleChange]);

  const onCharacterDetailPoseChangeHandlerAll = useCallback(() => {
    onCharacterDetailPoseChange("all");
  }, [onCharacterDetailPoseChange]);

  const onBackToCharactersClick = useCallback(() => {
    onSelectCharacter(null);
  }, [onSelectCharacter]);

  const categoryOptions = useMemo(() => {
    const categories = new Set(
      charactersForBrowseStyle
        .map((character) => character.category)
        .filter((category): category is string => Boolean(category?.trim())),
    );
    return [...categories].sort((a, b) => compareNatural(a, b));
  }, [charactersForBrowseStyle]);

  const serieOptions = useMemo(() => {
    const series = new Set(
      charactersForBrowseStyle
        .map((character) => character.serie)
        .filter((serie): serie is string => Boolean(serie?.trim())),
    );
    return [...series].sort((a, b) => compareNatural(a, b));
  }, [charactersForBrowseStyle]);

  const effectiveSelectedCategory = useMemo(() => {
    if (!selectedCategory) {
      return null;
    }

    return categoryOptions.includes(selectedCategory) ? selectedCategory : null;
  }, [selectedCategory, categoryOptions]);

  const effectiveSelectedSerie = useMemo(() => {
    if (!selectedSerie) {
      return null;
    }

    return serieOptions.includes(selectedSerie) ? selectedSerie : null;
  }, [selectedSerie, serieOptions]);

  const onCategoryToggle = useCallback((category: string) => {
    setSelectedCategory((previousCategory) => (previousCategory === category ? null : category));
  }, []);

  const onSerieToggle = useCallback((serie: string) => {
    setSelectedSerie((previousSerie) => (previousSerie === serie ? null : serie));
  }, []);

  const filteredCharacters = useMemo(() => {
    return charactersForBrowseStyle.filter((character) => {
      const matchesCategory = effectiveSelectedCategory
        ? character.category === effectiveSelectedCategory
        : true;
      const matchesSerie = effectiveSelectedSerie
        ? character.serie === effectiveSelectedSerie
        : true;
      return matchesCategory && matchesSerie;
    });
  }, [charactersForBrowseStyle, effectiveSelectedCategory, effectiveSelectedSerie]);

  const clearCharacterMetadataFilters = useCallback(() => {
    setSelectedCategory(null);
    setSelectedSerie(null);
  }, []);

  const hasMetadataFilters = categoryOptions.length > 0 || serieOptions.length > 0;

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
          {hasMetadataFilters && (
            <Box sx={QUICK_FILTERS_CONTAINER_SX}>
              <Stack direction="row" spacing={1} useFlexGap sx={QUICK_FILTERS_HEADER_SX}>
                <Typography variant="subtitle2" sx={FILTER_TITLE_SX}>
                  Quick filters
                </Typography>
                <Chip
                  label="All"
                  color={
                    !effectiveSelectedCategory && !effectiveSelectedSerie ? "primary" : "default"
                  }
                  onClick={clearCharacterMetadataFilters}
                />
              </Stack>

              {categoryOptions.length > 0 && (
                <Box sx={FILTER_SECTION_SX}>
                  <Typography variant="caption" sx={FILTER_TITLE_SX}>
                    Category
                  </Typography>
                  <Box sx={FILTERS_SX}>
                    {categoryOptions.map((category) => (
                      <ToggleFilterChip
                        key={category}
                        label={category}
                        selected={effectiveSelectedCategory === category}
                        color="primary"
                        onToggle={onCategoryToggle}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {serieOptions.length > 0 && (
                <Box sx={FILTER_SECTION_SX}>
                  <Typography variant="caption" sx={FILTER_TITLE_SX}>
                    Serie
                  </Typography>
                  <Box sx={FILTERS_SX}>
                    {serieOptions.map((serie) => (
                      <ToggleFilterChip
                        key={serie}
                        label={serie}
                        selected={effectiveSelectedSerie === serie}
                        color="secondary"
                        onToggle={onSerieToggle}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}

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
          {groupedCharacters.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No characters match the selected category/serie filters.
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
};
