"use client";

import {
  Alert,
  AppBar,
  Box,
  CircularProgress,
  Drawer,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { useEffect, useMemo, useState } from "react";
import { CharacterView } from "@/components/image-viewer/CharacterView";
import {
  DEFAULT_LIBRARY,
  SIDEBAR_WIDTH,
  WITH_SOMEBODY_FILTER,
} from "@/components/image-viewer/constants";
import { EmptyState } from "@/components/image-viewer/EmptyState";
import { HeroCard } from "@/components/image-viewer/HeroCard";
import { PoseView } from "@/components/image-viewer/PoseView";
import { SideMenu } from "@/components/image-viewer/SideMenu";
import { StyleView } from "@/components/image-viewer/StyleView";
import { buildPoseFilterOptions, buildPoseOptions } from "@/components/image-viewer/utils";
import type { ILibraryData, TMajorFilter, TStyle } from "@/types/library";

export default function ImageViewerApp() {
  const [library, setLibrary] = useState<ILibraryData>(DEFAULT_LIBRARY);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [majorFilter, setMajorFilter] = useState<TMajorFilter>("character");

  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [characterDetailStyle, setCharacterDetailStyle] = useState<"all" | TStyle>("all");
  const [characterDetailPose, setCharacterDetailPose] = useState<string>("all");

  const [styleViewStyle, setStyleViewStyle] = useState<TStyle>("3d");
  const [styleViewSearchText, setStyleViewSearchText] = useState<string>("");

  const [poseViewSelectedPoses, setPoseViewSelectedPoses] = useState<string[]>([]);
  const [poseViewStyle, setPoseViewStyle] = useState<"all" | TStyle>("all");
  const [poseViewCharacterSearch, setPoseViewCharacterSearch] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function loadLibrary() {
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
    }

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

  function handleMajorFilterChange(nextFilter: TMajorFilter) {
    setMajorFilter(nextFilter);
    closeMobileDrawer();

    if (nextFilter !== "character") {
      setSelectedCharacter(null);
      setCharacterDetailStyle("all");
      setCharacterDetailPose("all");
    }
  }

  function closeMobileDrawer() {
    setIsMobileDrawerOpen(false);
  }

  function togglePoseFilter(poseValue: string) {
    setPoseViewSelectedPoses((previousSelectedPoses) => {
      if (previousSelectedPoses.includes(poseValue)) {
        return previousSelectedPoses.filter((value) => value !== poseValue);
      }

      return [...previousSelectedPoses, poseValue];
    });
  }

  let bodyContent: React.ReactNode;

  if (isLoading) {
    bodyContent = (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 12 }}>
        <CircularProgress />
      </Box>
    );
  } else if (requestError) {
    bodyContent = <Alert severity="error">{requestError}</Alert>;
  } else if (!library.rootConfigured) {
    bodyContent = (
      <EmptyState
        title="Image root is not configured"
        description="Set SD_IMAGES_ROOT and restart the server. The app expects characters/{style}/{character}/*.png."
      />
    );
  } else if (library.warning) {
    bodyContent = <Alert severity="warning">{library.warning}</Alert>;
  } else if (library.images.length === 0) {
    bodyContent = (
      <EmptyState
        title="No PNG files found"
        description="Check the folder pattern characters/{style}/{character}/*.png and ensure styles use realistic, 3d, or anime."
      />
    );
  } else if (majorFilter === "character") {
    bodyContent = (
      <CharacterView
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
      />
    );
  } else if (majorFilter === "style") {
    bodyContent = (
      <StyleView
        styles={library.styles}
        styleViewStyle={styleViewStyle}
        styleViewSearchText={styleViewSearchText}
        styleFilteredImages={styleFilteredImages}
        onStyleSelect={(style) => {
          setStyleViewStyle(style);
          setStyleViewSearchText("");
        }}
        onStyleSearchTextChange={setStyleViewSearchText}
      />
    );
  } else {
    bodyContent = (
      <PoseView
        styles={library.styles}
        poseViewPoseOptions={poseViewPoseOptions}
        poseViewSelectedPoses={poseViewSelectedPoses}
        poseViewStyle={poseViewStyle}
        poseViewCharacterSearch={poseViewCharacterSearch}
        poseFilteredImages={poseFilteredImages}
        onClearPoses={() => setPoseViewSelectedPoses([])}
        onTogglePose={togglePoseFilter}
        onPoseStyleChange={setPoseViewStyle}
        onCharacterSearchChange={setPoseViewCharacterSearch}
      />
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          display: { sm: "none" },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setIsMobileDrawerOpen(true)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap>
            Image Viewer
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={isMobileDrawerOpen}
        onClose={closeMobileDrawer}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", sm: "none" },
          [`& .MuiDrawer-paper`]: {
            width: SIDEBAR_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <Toolbar />
        <SideMenu majorFilter={majorFilter} onMajorFilterChange={handleMajorFilterChange} />
      </Drawer>

      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: "none", sm: "block" },
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: SIDEBAR_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <Toolbar />
        <SideMenu majorFilter={majorFilter} onMajorFilterChange={handleMajorFilterChange} />
      </Drawer>

      <Box component="main" sx={{ ml: { sm: `${SIDEBAR_WIDTH}px` }, p: { xs: 2, sm: 3 } }}>
        <Toolbar sx={{ display: { xs: "flex", sm: "none" } }} />
        <HeroCard />
        {bodyContent}
      </Box>
    </Box>
  );
}
