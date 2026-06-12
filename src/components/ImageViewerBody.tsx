"use client";

import { Alert, Box, CircularProgress } from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CharactersView } from "@/components/image-viewer/CharactersView";
import { DEFAULT_LIBRARY, WITH_SOMEBODY_FILTER } from "@/components/image-viewer/constants";
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
  characterDetailStyle: "all" | TStyle;
  characterDetailPose: string;
  reloadToken: number;
  onImageSelect: (image: IImageItem) => void;

  setSelectedCharacter: (characterName: string | null) => void;
  setSelectedPoseFilters: (poses: string[]) => void;
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

  return [...categoryFilters, ...serieFilters].sort((a, b) => compareNatural(a.label, b.label));
};

export const ImageViewerBody = ({
  majorFilter,
  selectedCharacter,
  selectedPoseFilters,
  selectedMetadataFilterId,
  characterDetailStyle,
  characterDetailPose,
  reloadToken,
  onImageSelect,
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

        if (!isMounted) {
          return;
        }

        const validMetadataFilterIds = new Set(
          buildMetadataFilterOptions(data.characters).map((option) => option.id),
        );

        setLibrary(data);
        setRequestError(null);
        setStyleViewStyle(data.defaultStyle);

        if (!validMetadataFilterIds.has(selectedMetadataFilterId)) {
          setSelectedMetadataFilterId("");
        }

        const validPoseOptions = new Set(data.poses.map((pose) => pose.name));
        validPoseOptions.add(WITH_SOMEBODY_FILTER);

        const validSelectedPoses = selectedPoseFilters.filter((pose) => validPoseOptions.has(pose));
        if (validSelectedPoses.length !== selectedPoseFilters.length) {
          setSelectedPoseFilters(validSelectedPoses);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setRequestError(error instanceof Error ? error.message : "Unknown error");
      } finally {
        if (isMounted) {
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
    selectedMetadataFilterId,
    selectedPoseFilters,
    setSelectedMetadataFilterId,
    setSelectedPoseFilters,
  ]);

  const charactersForBrowseStyle = useMemo(() => {
    return library.characters.filter((character) =>
      character.styles.includes(library.defaultStyle),
    );
  }, [library.characters, library.defaultStyle]);

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
        { category: character.category, serie: character.serie },
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

    return library.images.filter((image) => image.characterName === selectedCharacter);
  }, [library.images, selectedCharacter]);

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

    return library.images.filter((image) => {
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
        } else {
          matchesMetadata = characterMetadata?.serie === selectedMetadataFilter.value;
        }
      }

      return matchesStyle && matchesSearchText && matchesMetadata;
    });
  }, [
    library.images,
    styleViewStyle,
    styleViewSearchText,
    effectiveStyleMetadataFilterId,
    metadataFilterById,
    characterMetadataByName,
  ]);

  const poseFilteredImages = useMemo(() => {
    const normalizedCharacterSearch = poseViewCharacterSearch.trim().toLowerCase();
    const selectedPoses = new Set(selectedPoseFilters);
    const isAllPosesSelected = selectedPoses.size === 0;
    const selectedMetadataFilter = metadataFilterById.get(effectivePoseMetadataFilterId);

    return library.images.filter((image) => {
      const matchesPose =
        isAllPosesSelected ||
        selectedPoses.has(image.poseBaseName) ||
        (selectedPoses.has(WITH_SOMEBODY_FILTER) && image.poseBaseName.startsWith("With "));
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
        } else {
          matchesMetadata = characterMetadata?.serie === selectedMetadataFilter.value;
        }
      }

      return matchesPose && matchesStyle && matchesCharacter && matchesMetadata;
    });
  }, [
    library.images,
    selectedPoseFilters,
    poseViewStyle,
    poseViewCharacterSearch,
    effectivePoseMetadataFilterId,
    metadataFilterById,
    characterMetadataByName,
  ]);

  const allPoseOptions = useMemo(() => {
    return library.poses.map((pose) => pose.name);
  }, [library.poses]);

  const poseViewPoseOptions = useMemo(() => {
    return buildPoseFilterOptions(allPoseOptions);
  }, [allPoseOptions]);

  const togglePoseFilter = useCallback(
    (poseValue: string) => {
      if (selectedPoseFilters.includes(poseValue)) {
        setSelectedPoseFilters(selectedPoseFilters.filter((value) => value !== poseValue));
        return;
      }

      setSelectedPoseFilters([...selectedPoseFilters, poseValue]);
    },
    [selectedPoseFilters, setSelectedPoseFilters],
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

  if (library.images.length === 0) {
    return (
      <EmptyState
        title="No PNG files found"
        description="Check the folder pattern characters/{style}/{character}/*.png and ensure styles use realistic, 3d, or anime."
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
        onSelectCharacter={setSelectedCharacter}
        onMetadataFilterIdChange={setSelectedMetadataFilterId}
        onCharacterDetailStyleChange={setCharacterDetailStyle}
        onCharacterDetailPoseChange={setCharacterDetailPose}
        onImageSelect={onImageSelect}
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
        onStyleSelect={onStyleSelect}
        onMetadataFilterChange={onStyleMetadataFilterChange}
        onClearMetadataFilter={onClearStyleMetadataFilter}
        onStyleSearchTextChange={setStyleViewSearchText}
        onImageSelect={onImageSelect}
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
      onClearPoses={onClearPoses}
      onTogglePose={togglePoseFilter}
      onPoseStyleChange={setPoseViewStyle}
      onMetadataFilterChange={onPoseMetadataFilterChange}
      onClearMetadataFilter={onClearPoseMetadataFilter}
      onCharacterSearchChange={setPoseViewCharacterSearch}
      onImageSelect={onImageSelect}
    />
  );
};
