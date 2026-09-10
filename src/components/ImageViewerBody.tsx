"use client";

import type { SelectChangeEvent } from "@mui/material";

import { Alert, Box, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IImageItem, ILibraryData, TCharacterSortOrder, TMajorFilter } from "@/types/library";

import { CharactersView } from "@/components/image-viewer/charactersView/CharactersView";
import { DEFAULT_LIBRARY } from "@/components/image-viewer/common/constants";
import { buildPoseOptions, formatStyleLabel } from "@/components/image-viewer/common/utils";
import { EmptyState } from "@/components/image-viewer/layout/EmptyState";
import { PosesView } from "@/components/image-viewer/posesView/PosesView";
import { StylesView } from "@/components/image-viewer/stylesView/StylesView";

interface IImageViewerBodyProps {
  majorFilter: TMajorFilter;
  selectedCharacter: string | null;
  selectedPoseFilters: string[];
  selectedMetadataFilterId: string;
  showOnlyNewImages: boolean;
  characterSortOrder: TCharacterSortOrder;
  styleViewStyle: string;
  poseViewStyle: string;
  characterDetailStyle: string;
  characterDetailPose: string;
  reloadToken: number;
  onImageSelect: (image: IImageItem, filteredImages: IImageItem[]) => void;
  onLibraryLoad: (library: ILibraryData) => void;

  setSelectedCharacter: (characterName: string | null) => void;
  setSelectedPoseFilters: (nextPoseFilters: string[] | ((prev: string[]) => string[])) => void;
  setSelectedMetadataFilterId: (metadataFilterId: string) => void;
  setStyleViewStyle: (style: string) => void;
  setPoseViewStyle: (style: string) => void;
  setCharacterDetailStyle: (style: string) => void;
  setCharacterDetailPose: (pose: string) => void;
}

const PROGRESS_CONTAINER = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  py: 12,
};

export const ImageViewerBody = ({
  majorFilter,
  selectedCharacter,
  selectedPoseFilters,
  selectedMetadataFilterId,
  showOnlyNewImages,
  characterSortOrder,
  styleViewStyle,
  poseViewStyle,
  characterDetailStyle,
  characterDetailPose,
  reloadToken,
  onImageSelect,
  onLibraryLoad,
  setSelectedCharacter,
  setSelectedPoseFilters,
  setSelectedMetadataFilterId,
  setStyleViewStyle,
  setPoseViewStyle,
  setCharacterDetailStyle,
  setCharacterDetailPose,
}: Readonly<IImageViewerBodyProps>) => {
  const [library, setLibrary] = useState<ILibraryData>(DEFAULT_LIBRARY);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const [styleViewSearchText, setStyleViewSearchText] = useState<string>("");
  const [poseViewCharacterSearch, setPoseViewCharacterSearch] = useState<string>("");

  const effectiveStyleViewStyle = useMemo(() => {
    return styleViewStyle && library.styles.includes(styleViewStyle)
      ? styleViewStyle
      : library.defaultStyle;
  }, [styleViewStyle, library.styles, library.defaultStyle]);

  const effectivePoseViewStyle = useMemo(() => {
    return poseViewStyle === "--all--" || library.styles.includes(poseViewStyle)
      ? poseViewStyle
      : "--all--";
  }, [poseViewStyle, library.styles]);

  const onStyleSelect = useCallback(
    (style: string) => {
      setStyleViewStyle(style);
      setStyleViewSearchText("");
    },
    [setStyleViewStyle],
  );

  const onClearPoses = useCallback(() => {
    setSelectedPoseFilters([]);
  }, [setSelectedPoseFilters]);

  const validateFilters = useCallback(
    (lib: ILibraryData, currentMetadataFilterId: string, currentPoseFilters: string[]) => {
      const validMetadataFilterIds = new Set(lib.metadataFilterOptions.map((option) => option.id));

      const nextMetadataFilterId = validMetadataFilterIds.has(currentMetadataFilterId)
        ? currentMetadataFilterId
        : "";

      const validPoseOptions = new Set(lib.poseFilterOptions.map((option) => option.value));

      const nextPoseFilters = currentPoseFilters.filter((pose) => validPoseOptions.has(pose));

      return { nextMetadataFilterId, nextPoseFilters };
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const loadLibrary = async () => {
      try {
        // Only show the full-page spinner on the first load; background reloads (e.g. after delete/redraw) keep content in place to preserve scroll position.
        if (!hasLoadedOnceRef.current) {
          setIsLoading(true);
        }
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
          hasLoadedOnceRef.current = true;

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
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    reloadToken,
    validateFilters,
    selectedMetadataFilterId,
    selectedPoseFilters,
    setSelectedMetadataFilterId,
    setSelectedPoseFilters,
    onLibraryLoad,
  ]);

  const filteredImages = useMemo(() => {
    return showOnlyNewImages ? library.images.filter((image) => image.isNew) : library.images;
  }, [library.images, showOnlyNewImages]);

  const charactersForBrowseStyle = useMemo(() => {
    const visibleCharacterNames = new Set(filteredImages.map((image) => image.characterName));

    return library.characters.filter(
      (character) =>
        character.styles.includes(library.defaultStyle) &&
        visibleCharacterNames.has(character.name),
    );
  }, [library.characters, library.defaultStyle, filteredImages]);

  const metadataFilterOptions = library.metadataFilterOptions;

  const styleLabel = useCallback(
    (style: string) => formatStyleLabel(style, library.styleLabels),
    [library.styleLabels],
  );

  const metadataFilterById = useMemo(() => {
    return new Map(metadataFilterOptions.map((option) => [option.id, option]));
  }, [metadataFilterOptions]);

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
        characterDetailStyle === "--all--" ? true : image.style === characterDetailStyle;
      const matchesPose =
        characterDetailPose === "--all--" ? true : image.poseBaseName === characterDetailPose;
      return matchesStyle && matchesPose;
    });
  }, [selectedCharacterImages, characterDetailStyle, characterDetailPose]);

  const styleFilteredImages = useMemo(() => {
    const normalizedSearchText = styleViewSearchText.trim().toLowerCase();
    const selectedMetadataFilter = metadataFilterById.get(effectiveStyleMetadataFilterId);

    const matchingImages = filteredImages.filter((image) => {
      const matchesStyle = image.style === effectiveStyleViewStyle;
      const matchesSearchText =
        normalizedSearchText.length === 0
          ? true
          : image.characterName.toLowerCase().includes(normalizedSearchText) ||
            image.poseBaseName.toLowerCase().includes(normalizedSearchText);
      const matchesMetadata = selectedMetadataFilter
        ? (library.characterMetadataFilterIdsByName[image.characterName]?.includes(
            selectedMetadataFilter.id,
          ) ?? false)
        : true;

      return matchesStyle && matchesSearchText && matchesMetadata;
    });

    if (characterSortOrder === "date") {
      return [...matchingImages].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    }

    return matchingImages;
  }, [
    characterSortOrder,
    effectiveStyleMetadataFilterId,
    effectiveStyleViewStyle,
    filteredImages,
    metadataFilterById,
    styleViewSearchText,
    library.characterMetadataFilterIdsByName,
  ]);

  const poseFilteredImages = useMemo(() => {
    const normalizedCharacterSearch = poseViewCharacterSearch.trim().toLowerCase();
    const selectedPoses = new Set(selectedPoseFilters);
    const isAllPosesSelected = selectedPoses.size === 0;
    const selectedMetadataFilter = metadataFilterById.get(effectivePoseMetadataFilterId);

    const matchingImages = filteredImages.filter((image) => {
      const matchesPatternPose = image.posePatternFilterIds.some((filterId) =>
        selectedPoses.has(filterId),
      );
      const matchesPose =
        isAllPosesSelected || selectedPoses.has(image.poseBaseName) || matchesPatternPose;
      const matchesStyle =
        effectivePoseViewStyle === "--all--" ? true : image.style === effectivePoseViewStyle;
      const matchesCharacter =
        normalizedCharacterSearch.length === 0
          ? true
          : image.characterName.toLowerCase().includes(normalizedCharacterSearch);
      const matchesMetadata = selectedMetadataFilter
        ? (library.characterMetadataFilterIdsByName[image.characterName]?.includes(
            selectedMetadataFilter.id,
          ) ?? false)
        : true;

      return matchesPose && matchesStyle && matchesCharacter && matchesMetadata;
    });

    if (characterSortOrder === "date") {
      return [...matchingImages].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    }

    return matchingImages;
  }, [
    characterSortOrder,
    effectivePoseMetadataFilterId,
    effectivePoseViewStyle,
    filteredImages,
    metadataFilterById,
    poseViewCharacterSearch,
    selectedPoseFilters,
    library.characterMetadataFilterIdsByName,
  ]);

  const poseViewPoseOptions = library.poseFilterOptions;

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

  const onMetadataFilterChange = useCallback(
    (event: SelectChangeEvent) => {
      setSelectedMetadataFilterId(event.target.value);
    },
    [setSelectedMetadataFilterId],
  );

  const onClearMetadataFilter = useCallback(() => {
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
            : "Check the folder pattern characters/{style}/{character}/*.png and ensure style folders match your configured styles."
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
        styleLabel={styleLabel}
        metadataFilterOptions={metadataFilterOptions}
        onClearMetadataFilter={onClearMetadataFilter}
        onMetadataFilterChange={onMetadataFilterChange}
        selectedCharacter={selectedCharacter}
        selectedMetadataFilterId={effectiveStyleMetadataFilterId}
        characterDetailStyle={characterDetailStyle}
        characterDetailPose={characterDetailPose}
        characterDetailPoseOptions={characterDetailPoseOptions}
        charactersForBrowseStyle={charactersForBrowseStyle}
        visibleCharacterDetailImages={visibleCharacterDetailImages}
        showNewBadge={!showOnlyNewImages}
        characterSortOrder={characterSortOrder}
        onSelectCharacter={setSelectedCharacter}
        onCharacterDetailStyleChange={setCharacterDetailStyle}
        onCharacterDetailPoseChange={setCharacterDetailPose}
        onImageSelect={handleCharacterImageSelect}
      />
    );
  } else if (majorFilter === "style") {
    return (
      <StylesView
        styles={library.styles}
        styleLabel={styleLabel}
        styleViewStyle={effectiveStyleViewStyle}
        styleViewSearchText={styleViewSearchText}
        metadataFilterOptions={metadataFilterOptions}
        selectedMetadataFilterId={effectiveStyleMetadataFilterId}
        styleFilteredImages={styleFilteredImages}
        showNewBadge={!showOnlyNewImages}
        onStyleSelect={onStyleSelect}
        onMetadataFilterChange={onMetadataFilterChange}
        onClearMetadataFilter={onClearMetadataFilter}
        onStyleSearchTextChange={setStyleViewSearchText}
        onImageSelect={handleStyleImageSelect}
      />
    );
  }

  return (
    <PosesView
      styles={library.styles}
      styleLabel={styleLabel}
      poseViewPoseOptions={poseViewPoseOptions}
      poseViewSelectedPoses={selectedPoseFilters}
      poseViewStyle={effectivePoseViewStyle}
      poseViewCharacterSearch={poseViewCharacterSearch}
      metadataFilterOptions={metadataFilterOptions}
      selectedMetadataFilterId={effectivePoseMetadataFilterId}
      poseFilteredImages={poseFilteredImages}
      showNewBadge={!showOnlyNewImages}
      onClearPoses={onClearPoses}
      onTogglePose={togglePoseFilter}
      onPoseStyleChange={setPoseViewStyle}
      onMetadataFilterChange={onMetadataFilterChange}
      onClearMetadataFilter={onClearMetadataFilter}
      onCharacterSearchChange={setPoseViewCharacterSearch}
      onImageSelect={handlePoseImageSelect}
    />
  );
};
