"use client";

import { Alert, Box, CircularProgress } from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CharactersView } from "@/components/image-viewer/CharactersView";
import { DEFAULT_LIBRARY } from "@/components/image-viewer/constants";
import { EmptyState } from "@/components/image-viewer/EmptyState";
import { PosesView } from "@/components/image-viewer/PosesView";
import { StylesView } from "@/components/image-viewer/StylesView";
import { buildPoseFilterOptions, buildPoseOptions } from "@/components/image-viewer/utils";
import type {
  ICharacterSummary,
  IImageItem,
  ILibraryData,
  IMetadataFilterOption,
  TMajorFilter,
  TStyle,
} from "@/types/library";

interface IImageViewerBodyProps {
  majorFilter: TMajorFilter;
  selectedCharacter: string | null;
  selectedPoseFilters: string[];
  selectedMetadataFilterId: string;
  showOnlyNewImages: boolean;
  characterDetailStyle: "all" | TStyle;
  characterDetailPose: string;
  reloadToken: number;
  onImageSelect: (image: IImageItem, filteredImages: IImageItem[]) => void;
  onLibraryLoad: (library: ILibraryData) => void;

  setSelectedCharacter: (characterName: string | null) => void;
  setSelectedPoseFilters: (nextPoseFilters: string[] | ((prev: string[]) => string[])) => void;
  setSelectedMetadataFilterId: (metadataFilterId: string) => void;
  setCharacterDetailStyle: (style: "all" | TStyle) => void;
  setCharacterDetailPose: (pose: string) => void;
}

const PROGRESS_CONTAINER = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  py: 12,
};

const compareNatural = (a: string, b: string): number => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};

const buildMetadataFilterOptions = (characters: ICharacterSummary[]): IMetadataFilterOption[] => {
  const categories = new Set(
    characters
      .map((character) => character.category)
      .filter((category): category is string => Boolean(category?.trim())),
  );
  const series = new Set(
    characters
      .map((character) => character.serie)
      .filter((serie): serie is string => Boolean(serie?.trim())),
  );
  const tags = new Set(
    characters.flatMap((character) => character.tags).filter((tag) => Boolean(tag?.trim())),
  );

  const categoryFilters = [...categories].map((category) => ({
    id: `category::${category}`,
    type: "category" as const,
    value: category,
    label: category,
  }));
  const serieFilters = [...series].map((serie) => ({
    id: `serie::${serie}`,
    type: "serie" as const,
    value: serie,
    label: serie,
  }));
  const tagFilters = [...tags].map((tag) => ({
    id: `tag::${tag}`,
    type: "tag" as const,
    value: tag,
    label: tag,
  }));

  return [...categoryFilters, ...serieFilters, ...tagFilters].sort((a, b) =>
    compareNatural(a.label, b.label),
  );
};

export const ImageViewerBody = ({
  majorFilter,
  selectedCharacter,
  selectedPoseFilters,
  selectedMetadataFilterId,
  showOnlyNewImages,
  characterDetailStyle,
  characterDetailPose,
  reloadToken,
  onImageSelect,
  onLibraryLoad,
  setSelectedCharacter,
  setSelectedPoseFilters,
  setSelectedMetadataFilterId,
  setCharacterDetailStyle,
  setCharacterDetailPose,
}: Readonly<IImageViewerBodyProps>) => {
  const [library, setLibrary] = useState<ILibraryData>(DEFAULT_LIBRARY);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [styleViewStyle, setStyleViewStyle] = useState<TStyle>("3d");
  const [styleViewSearchText, setStyleViewSearchText] = useState<string>("");

  const [poseViewStyle, setPoseViewStyle] = useState<"all" | TStyle>("all");
  const [poseViewCharacterSearch, setPoseViewCharacterSearch] = useState<string>("");

  const onStyleSelect = useCallback((style: TStyle) => {
    setStyleViewStyle(style);
    setStyleViewSearchText("");
  }, []);

  const onClearPoses = useCallback(() => {
    setSelectedPoseFilters([]);
  }, [setSelectedPoseFilters]);

  const validateFilters = useCallback(
    (lib: ILibraryData, currentMetadataFilterId: string, currentPoseFilters: string[]) => {
      const validMetadataFilterIds = new Set(
        buildMetadataFilterOptions(lib.characters).map((option) => option.id),
      );

      const nextMetadataFilterId = validMetadataFilterIds.has(currentMetadataFilterId)
        ? currentMetadataFilterId
        : "";

      const validPoseOptions = new Set(lib.poses.map((pose) => pose.name));
      for (const posePatternFilter of lib.posePatternFilters) {
        validPoseOptions.add(posePatternFilter.id);
      }

      const nextPoseFilters = currentPoseFilters.filter((pose) => validPoseOptions.has(pose));

      return { nextMetadataFilterId, nextPoseFilters };
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const loadLibrary = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/library", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Could not load library (${response.status}).`);
        }

        const data: ILibraryData = await response.json();

        if (isMounted) {
          const { nextMetadataFilterId, nextPoseFilters } = validateFilters(
            data,
            selectedMetadataFilterId,
            selectedPoseFilters,
          );

          setLibrary(data);
          onLibraryLoad(data);
          setRequestError(null);
          setStyleViewStyle(data.defaultStyle);

          if (nextMetadataFilterId !== selectedMetadataFilterId) {
            setSelectedMetadataFilterId(nextMetadataFilterId);
          }

          if (
            nextPoseFilters.length !== selectedPoseFilters.length ||
            !nextPoseFilters.every((pose, idx) => pose === selectedPoseFilters[idx])
          ) {
            setSelectedPoseFilters(nextPoseFilters);
          }

          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setRequestError(error instanceof Error ? error.message : "Unknown error");
          setIsLoading(false);
        }
      }
    };

    void loadLibrary();

    return () => {
      isMounted = false;
    };
  }, [
    reloadToken,
    validateFilters,
    selectedMetadataFilterId,
    selectedPoseFilters,
    setSelectedMetadataFilterId,
    setSelectedPoseFilters,
    onLibraryLoad,
  ]);

  const filteredImages = useMemo(() => {
    if (!showOnlyNewImages) {
      return library.images;
    }

    return library.images.filter((image) => image.isNew);
  }, [library.images, showOnlyNewImages]);

  const charactersForBrowseStyle = useMemo(() => {
    const visibleCharacterNames = new Set(filteredImages.map((image) => image.characterName));

    return library.characters.filter(
      (character) =>
        character.styles.includes(library.defaultStyle) &&
        visibleCharacterNames.has(character.name),
    );
  }, [library.characters, library.defaultStyle, filteredImages]);

  const metadataFilterOptions = useMemo((): IMetadataFilterOption[] => {
    return buildMetadataFilterOptions(library.characters);
  }, [library.characters]);

  const metadataFilterById = useMemo(() => {
    return new Map(metadataFilterOptions.map((option) => [option.id, option]));
  }, [metadataFilterOptions]);

  const characterMetadataByName = useMemo(() => {
    return new Map(
      library.characters.map((character) => [
        character.name,
        { category: character.category, serie: character.serie, tags: character.tags },
      ]),
    );
  }, [library.characters]);

  const effectiveStyleMetadataFilterId = useMemo(() => {
    if (!selectedMetadataFilterId) {
      return "";
    }

    return metadataFilterById.has(selectedMetadataFilterId) ? selectedMetadataFilterId : "";
  }, [selectedMetadataFilterId, metadataFilterById]);

  const effectivePoseMetadataFilterId = useMemo(() => {
    if (!selectedMetadataFilterId) {
      return "";
    }

    return metadataFilterById.has(selectedMetadataFilterId) ? selectedMetadataFilterId : "";
  }, [selectedMetadataFilterId, metadataFilterById]);

  const selectedCharacterImages = useMemo(() => {
    if (!selectedCharacter) {
      return [];
    }

    return filteredImages.filter((image) => image.characterName === selectedCharacter);
  }, [filteredImages, selectedCharacter]);

  const characterDetailPoseOptions = useMemo(() => {
    return buildPoseOptions(selectedCharacterImages);
  }, [selectedCharacterImages]);

  const visibleCharacterDetailImages = useMemo(() => {
    return selectedCharacterImages.filter((image) => {
      const matchesStyle =
        characterDetailStyle === "all" ? true : image.style === characterDetailStyle;
      const matchesPose =
        characterDetailPose === "all" ? true : image.poseBaseName === characterDetailPose;
      return matchesStyle && matchesPose;
    });
  }, [selectedCharacterImages, characterDetailStyle, characterDetailPose]);

  const styleFilteredImages = useMemo(() => {
    const normalizedSearchText = styleViewSearchText.trim().toLowerCase();
    const selectedMetadataFilter = metadataFilterById.get(effectiveStyleMetadataFilterId);

    return filteredImages.filter((image) => {
      const matchesStyle = image.style === styleViewStyle;
      const matchesSearchText =
        normalizedSearchText.length === 0
          ? true
          : image.characterName.toLowerCase().includes(normalizedSearchText) ||
            image.poseBaseName.toLowerCase().includes(normalizedSearchText);
      const characterMetadata = characterMetadataByName.get(image.characterName);
      let matchesMetadata = true;

      if (selectedMetadataFilter) {
        if (selectedMetadataFilter.type === "category") {
          matchesMetadata = characterMetadata?.category === selectedMetadataFilter.value;
        } else if (selectedMetadataFilter.type === "serie") {
          matchesMetadata = characterMetadata?.serie === selectedMetadataFilter.value;
        } else {
          matchesMetadata = characterMetadata?.tags.includes(selectedMetadataFilter.value) ?? false;
        }
      }

      return matchesStyle && matchesSearchText && matchesMetadata;
    });
  }, [
    filteredImages,
    styleViewStyle,
    styleViewSearchText,
    effectiveStyleMetadataFilterId,
    metadataFilterById,
    characterMetadataByName,
  ]);

  const posePatternFiltersById = useMemo(() => {
    const filtersById = new Map<string, { label: string; regex: RegExp }>();

    for (const filter of library.posePatternFilters) {
      try {
        filtersById.set(filter.id, {
          label: filter.label,
          regex: new RegExp(filter.pattern, filter.flags),
        });
      } catch {
        // Ignore invalid patterns to keep filtering resilient.
      }
    }

    return filtersById;
  }, [library.posePatternFilters]);

  const poseFilteredImages = useMemo(() => {
    const normalizedCharacterSearch = poseViewCharacterSearch.trim().toLowerCase();
    const selectedPoses = new Set(selectedPoseFilters);
    const isAllPosesSelected = selectedPoses.size === 0;
    const selectedPatternFilters = [...selectedPoses]
      .map((selectedPose) => posePatternFiltersById.get(selectedPose))
      .filter((filter): filter is { label: string; regex: RegExp } => Boolean(filter));
    const selectedMetadataFilter = metadataFilterById.get(effectivePoseMetadataFilterId);

    return filteredImages.filter((image) => {
      const matchesPatternPose = selectedPatternFilters.some((filter) => {
        return filter.regex.test(image.poseBaseName);
      });
      const matchesPose =
        isAllPosesSelected || selectedPoses.has(image.poseBaseName) || matchesPatternPose;
      const matchesStyle = poseViewStyle === "all" ? true : image.style === poseViewStyle;
      const matchesCharacter =
        normalizedCharacterSearch.length === 0
          ? true
          : image.characterName.toLowerCase().includes(normalizedCharacterSearch);
      const characterMetadata = characterMetadataByName.get(image.characterName);
      let matchesMetadata = true;

      if (selectedMetadataFilter) {
        if (selectedMetadataFilter.type === "category") {
          matchesMetadata = characterMetadata?.category === selectedMetadataFilter.value;
        } else if (selectedMetadataFilter.type === "serie") {
          matchesMetadata = characterMetadata?.serie === selectedMetadataFilter.value;
        } else {
          matchesMetadata = characterMetadata?.tags.includes(selectedMetadataFilter.value) ?? false;
        }
      }

      return matchesPose && matchesStyle && matchesCharacter && matchesMetadata;
    });
  }, [
    filteredImages,
    selectedPoseFilters,
    poseViewStyle,
    poseViewCharacterSearch,
    posePatternFiltersById,
    effectivePoseMetadataFilterId,
    metadataFilterById,
    characterMetadataByName,
  ]);

  const allPoseOptions = useMemo(() => {
    const poseNames = new Set(filteredImages.map((image) => image.poseBaseName));
    return [...poseNames].sort(compareNatural);
  }, [filteredImages]);

  const poseViewPoseOptions = useMemo(() => {
    return buildPoseFilterOptions(allPoseOptions, library.posePatternFilters);
  }, [allPoseOptions, library.posePatternFilters]);

  const togglePoseFilter = useCallback(
    (poseValue: string) => {
      setSelectedPoseFilters((current) => {
        if (current.includes(poseValue)) {
          return current.filter((value) => value !== poseValue);
        }
        return [...current, poseValue];
      });
    },
    [setSelectedPoseFilters],
  );

  const onStyleMetadataFilterChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedMetadataFilterId(event.target.value);
    },
    [setSelectedMetadataFilterId],
  );

  const onPoseMetadataFilterChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      setSelectedMetadataFilterId(event.target.value);
    },
    [setSelectedMetadataFilterId],
  );

  const onClearStyleMetadataFilter = useCallback(() => {
    setSelectedMetadataFilterId("");
  }, [setSelectedMetadataFilterId]);

  const onClearPoseMetadataFilter = useCallback(() => {
    setSelectedMetadataFilterId("");
  }, [setSelectedMetadataFilterId]);

  const handleCharacterImageSelect = useCallback(
    (image: IImageItem) => {
      onImageSelect(image, visibleCharacterDetailImages);
    },
    [onImageSelect, visibleCharacterDetailImages],
  );

  const handleStyleImageSelect = useCallback(
    (image: IImageItem) => {
      onImageSelect(image, styleFilteredImages);
    },
    [onImageSelect, styleFilteredImages],
  );

  const handlePoseImageSelect = useCallback(
    (image: IImageItem) => {
      onImageSelect(image, poseFilteredImages);
    },
    [onImageSelect, poseFilteredImages],
  );

  if (isLoading) {
    return (
      <Box sx={PROGRESS_CONTAINER}>
        <CircularProgress />
      </Box>
    );
  }

  if (requestError) {
    return <Alert severity="error">{requestError}</Alert>;
  }

  if (!library.rootConfigured) {
    return (
      <EmptyState
        title="Image root is not configured"
        description="Set SD_IMAGES_ROOT and restart the server. The app expects characters/{style}/{character}/*.png."
      />
    );
  }

  if (library.warning) {
    return <Alert severity="warning">{library.warning}</Alert>;
  }

  if (filteredImages.length === 0) {
    return (
      <EmptyState
        title={showOnlyNewImages ? "No new images found" : "No PNG files found"}
        description={
          showOnlyNewImages
            ? "No images discovered in the last 3 days are currently available."
            : "Check the folder pattern characters/{style}/{character}/*.png and ensure styles use realistic, 3d, or anime."
        }
      />
    );
  }

  if (majorFilter === "character") {
    return (
      <CharactersView
        styles={library.styles}
        defaultStyle={library.defaultStyle}
        browseStyle={library.defaultStyle}
        selectedCharacter={selectedCharacter}
        selectedMetadataFilterId={effectiveStyleMetadataFilterId}
        characterDetailStyle={characterDetailStyle}
        characterDetailPose={characterDetailPose}
        characterDetailPoseOptions={characterDetailPoseOptions}
        charactersForBrowseStyle={charactersForBrowseStyle}
        visibleCharacterDetailImages={visibleCharacterDetailImages}
        showNewBadge={!showOnlyNewImages}
        onSelectCharacter={setSelectedCharacter}
        onMetadataFilterIdChange={setSelectedMetadataFilterId}
        onCharacterDetailStyleChange={setCharacterDetailStyle}
        onCharacterDetailPoseChange={setCharacterDetailPose}
        onImageSelect={handleCharacterImageSelect}
      />
    );
  } else if (majorFilter === "style") {
    return (
      <StylesView
        styles={library.styles}
        styleViewStyle={styleViewStyle}
        styleViewSearchText={styleViewSearchText}
        metadataFilterOptions={metadataFilterOptions}
        selectedMetadataFilterId={effectiveStyleMetadataFilterId}
        styleFilteredImages={styleFilteredImages}
        showNewBadge={!showOnlyNewImages}
        onStyleSelect={onStyleSelect}
        onMetadataFilterChange={onStyleMetadataFilterChange}
        onClearMetadataFilter={onClearStyleMetadataFilter}
        onStyleSearchTextChange={setStyleViewSearchText}
        onImageSelect={handleStyleImageSelect}
      />
    );
  }

  return (
    <PosesView
      styles={library.styles}
      poseViewPoseOptions={poseViewPoseOptions}
      poseViewSelectedPoses={selectedPoseFilters}
      poseViewStyle={poseViewStyle}
      poseViewCharacterSearch={poseViewCharacterSearch}
      metadataFilterOptions={metadataFilterOptions}
      selectedMetadataFilterId={effectivePoseMetadataFilterId}
      poseFilteredImages={poseFilteredImages}
      showNewBadge={!showOnlyNewImages}
      onClearPoses={onClearPoses}
      onTogglePose={togglePoseFilter}
      onPoseStyleChange={setPoseViewStyle}
      onMetadataFilterChange={onPoseMetadataFilterChange}
      onClearMetadataFilter={onClearPoseMetadataFilter}
      onCharacterSearchChange={setPoseViewCharacterSearch}
      onImageSelect={handlePoseImageSelect}
    />
  );
};
