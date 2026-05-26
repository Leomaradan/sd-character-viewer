"use client";

import { Alert, Box, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CharactersView } from "@/components/image-viewer/CharactersView";
import { DEFAULT_LIBRARY, WITH_SOMEBODY_FILTER } from "@/components/image-viewer/constants";
import { EmptyState } from "@/components/image-viewer/EmptyState";
import { PosesView } from "@/components/image-viewer/PosesView";
import { StylesView } from "@/components/image-viewer/StylesView";
import { buildPoseFilterOptions, buildPoseOptions } from "@/components/image-viewer/utils";
import type { IImageItem, ILibraryData, TMajorFilter, TStyle } from "@/types/library";

interface IImageViewerBodyProps {
  majorFilter: TMajorFilter;
  selectedCharacter: string | null;
  characterDetailStyle: "all" | TStyle;
  characterDetailPose: string;
  onImageSelect: (image: IImageItem) => void;

  setSelectedCharacter: (characterName: string | null) => void;
  setCharacterDetailStyle: (style: "all" | TStyle) => void;
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
  characterDetailStyle,
  characterDetailPose,
  onImageSelect,
  setSelectedCharacter,
  setCharacterDetailStyle,
  setCharacterDetailPose,
}: Readonly<IImageViewerBodyProps>) => {
  const [library, setLibrary] = useState<ILibraryData>(DEFAULT_LIBRARY);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [styleViewStyle, setStyleViewStyle] = useState<TStyle>("3d");
  const [styleViewSearchText, setStyleViewSearchText] = useState<string>("");

  const [poseViewSelectedPoses, setPoseViewSelectedPoses] = useState<string[]>([]);
  const [poseViewStyle, setPoseViewStyle] = useState<"all" | TStyle>("all");
  const [poseViewCharacterSearch, setPoseViewCharacterSearch] = useState<string>("");

  const onStyleSelect = useCallback((style: TStyle) => {
    setStyleViewStyle(style);
    setStyleViewSearchText("");
  }, []);

  const onClearPoses = useCallback(() => {
    setPoseViewSelectedPoses([]);
  }, []);

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

        setLibrary(data);
        setRequestError(null);
        setStyleViewStyle(data.defaultStyle);
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
  }, []);

  const charactersForBrowseStyle = useMemo(() => {
    return library.characters.filter((character) =>
      character.styles.includes(library.defaultStyle),
    );
  }, [library.characters, library.defaultStyle]);

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

    return library.images.filter((image) => {
      const matchesStyle = image.style === styleViewStyle;
      const matchesSearchText =
        normalizedSearchText.length === 0
          ? true
          : image.characterName.toLowerCase().includes(normalizedSearchText) ||
            image.poseBaseName.toLowerCase().includes(normalizedSearchText);

      return matchesStyle && matchesSearchText;
    });
  }, [library.images, styleViewStyle, styleViewSearchText]);

  const poseFilteredImages = useMemo(() => {
    const normalizedCharacterSearch = poseViewCharacterSearch.trim().toLowerCase();
    const selectedPoses = new Set(poseViewSelectedPoses);
    const isAllPosesSelected = selectedPoses.size === 0;

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
      return matchesPose && matchesStyle && matchesCharacter;
    });
  }, [library.images, poseViewSelectedPoses, poseViewStyle, poseViewCharacterSearch]);

  const allPoseOptions = useMemo(() => {
    return library.poses.map((pose) => pose.name);
  }, [library.poses]);

  const poseViewPoseOptions = useMemo(() => {
    return buildPoseFilterOptions(allPoseOptions);
  }, [allPoseOptions]);

  const togglePoseFilter = useCallback((poseValue: string) => {
    setPoseViewSelectedPoses((previousSelectedPoses) => {
      if (previousSelectedPoses.includes(poseValue)) {
        return previousSelectedPoses.filter((value) => value !== poseValue);
      }

      return [...previousSelectedPoses, poseValue];
    });
  }, []);

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
        characterDetailStyle={characterDetailStyle}
        characterDetailPose={characterDetailPose}
        characterDetailPoseOptions={characterDetailPoseOptions}
        charactersForBrowseStyle={charactersForBrowseStyle}
        visibleCharacterDetailImages={visibleCharacterDetailImages}
        onSelectCharacter={setSelectedCharacter}
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
        styleFilteredImages={styleFilteredImages}
        onStyleSelect={onStyleSelect}
        onStyleSearchTextChange={setStyleViewSearchText}
        onImageSelect={onImageSelect}
      />
    );
  }

  return (
    <PosesView
      styles={library.styles}
      poseViewPoseOptions={poseViewPoseOptions}
      poseViewSelectedPoses={poseViewSelectedPoses}
      poseViewStyle={poseViewStyle}
      poseViewCharacterSearch={poseViewCharacterSearch}
      poseFilteredImages={poseFilteredImages}
      onClearPoses={onClearPoses}
      onTogglePose={togglePoseFilter}
      onPoseStyleChange={setPoseViewStyle}
      onCharacterSearchChange={setPoseViewCharacterSearch}
      onImageSelect={onImageSelect}
    />
  );
};
