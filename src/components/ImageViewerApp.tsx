"use client";

import {
  Alert,
  AppBar,
  Box,
  IconButton,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import type { SelectChangeEvent } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { IImageItem, ILibraryData, TMajorFilter, TStyle } from "@/types/library";

const DEFAULT_LIBRARY: ILibraryData = {
  rootConfigured: false,
  rootPath: null,
  defaultStyle: "3d",
  styles: ["realistic", "3d", "anime"],
  images: [],
  characters: [],
  poses: [],
  warning: null,
};

const SIDEBAR_WIDTH = 280;

function getImageUrl(relativePath: string): string {
  return `/api/image?path=${encodeURIComponent(relativePath)}`;
}

function formatMajorFilterLabel(majorFilter: TMajorFilter): string {
  if (majorFilter === "character") {
    return "Filter by Character";
  }

  if (majorFilter === "style") {
    return "Filter by Style";
  }

  return "Filter by Pose";
}

function majorFilterFromValue(value: string): TMajorFilter {
  if (value === "style" || value === "pose" || value === "character") {
    return value;
  }

  return "character";
}

function buildPoseOptions(images: IImageItem[]): string[] {
  const uniquePoses = new Set(images.map((image) => image.poseBaseName));
  return [...uniquePoses].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function buildCharacterOptions(images: IImageItem[]): string[] {
  const uniqueCharacters = new Set(images.map((image) => image.characterName));
  return [...uniqueCharacters].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function EmptyState({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <Card variant="outlined" sx={{ borderStyle: "dashed" }}>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}

function ImageCard({ image }: Readonly<{ image: IImageItem }>) {
  return (
    <Card elevation={1}>
      <Box
        component="img"
        src={getImageUrl(image.relativePath)}
        alt={`${image.characterName} ${image.poseName}`}
        sx={{
          width: "100%",
          aspectRatio: "3 / 4",
          objectFit: "cover",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      />
      <CardContent>
        <Typography variant="subtitle1" noWrap>
          {image.characterName}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {image.style} - {image.poseName}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function ImageViewerApp() {
  const [library, setLibrary] = useState<ILibraryData>(DEFAULT_LIBRARY);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [majorFilter, setMajorFilter] = useState<TMajorFilter>("character");

  const [browseStyle, setBrowseStyle] = useState<TStyle>("3d");
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [characterDetailStyle, setCharacterDetailStyle] = useState<"all" | TStyle>("all");
  const [characterDetailPose, setCharacterDetailPose] = useState<string>("all");

  const [styleViewStyle, setStyleViewStyle] = useState<TStyle>("3d");
  const [styleViewCharacter, setStyleViewCharacter] = useState<string>("all");
  const [styleViewPose, setStyleViewPose] = useState<string>("all");

  const [poseViewPose, setPoseViewPose] = useState<string>("all");
  const [poseViewStyle, setPoseViewStyle] = useState<"all" | TStyle>("all");
  const [poseViewCharacter, setPoseViewCharacter] = useState<string>("all");

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
        setBrowseStyle(data.defaultStyle);
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
    return library.characters.filter((character) => character.styles.includes(browseStyle));
  }, [browseStyle, library.characters]);

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
    return library.images.filter((image) => {
      const matchesStyle = image.style === styleViewStyle;
      const matchesCharacter =
        styleViewCharacter === "all" ? true : image.characterName === styleViewCharacter;
      const matchesPose = styleViewPose === "all" ? true : image.poseBaseName === styleViewPose;
      return matchesStyle && matchesCharacter && matchesPose;
    });
  }, [library.images, styleViewStyle, styleViewCharacter, styleViewPose]);

  const styleViewCharacters = useMemo(() => {
    return buildCharacterOptions(library.images.filter((image) => image.style === styleViewStyle));
  }, [library.images, styleViewStyle]);

  const styleViewPoses = useMemo(() => {
    return buildPoseOptions(library.images.filter((image) => image.style === styleViewStyle));
  }, [library.images, styleViewStyle]);

  const poseFilteredImages = useMemo(() => {
    return library.images.filter((image) => {
      const matchesPose = poseViewPose === "all" ? true : image.poseBaseName === poseViewPose;
      const matchesStyle = poseViewStyle === "all" ? true : image.style === poseViewStyle;
      const matchesCharacter =
        poseViewCharacter === "all" ? true : image.characterName === poseViewCharacter;
      return matchesPose && matchesStyle && matchesCharacter;
    });
  }, [library.images, poseViewPose, poseViewStyle, poseViewCharacter]);

  const allPoseOptions = useMemo(() => {
    return library.poses.map((pose) => pose.name);
  }, [library.poses]);

  const allCharacterOptions = useMemo(() => {
    return library.characters.map((character) => character.name);
  }, [library.characters]);

  function handleMajorFilterChange(event: SelectChangeEvent<string>) {
    const nextFilter = majorFilterFromValue(event.target.value);
    setMajorFilter(nextFilter);

    if (nextFilter !== "character") {
      setSelectedCharacter(null);
      setCharacterDetailStyle("all");
      setCharacterDetailPose("all");
    }
  }

  function closeMobileDrawer() {
    setIsMobileDrawerOpen(false);
  }

  const heroContent = (
    <Card
      sx={{
        borderRadius: 4,
        mb: 2,
        background:
          "radial-gradient(circle at 20% 10%, rgba(31,111,235,0.28), transparent 40%), radial-gradient(circle at 80% 90%, rgba(249,115,22,0.18), transparent 45%), linear-gradient(135deg, #0f172a, #172554)",
        color: "#f8fafc",
      }}
    >
      <CardContent>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Stable Diffusion Character Viewer
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.88, mt: 1 }}>
          Browse characters, styles, and poses from your mounted image library.
        </Typography>
      </CardContent>
    </Card>
  );

  const sideMenu = (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Major Filter
      </Typography>
      <FormControl fullWidth>
        <InputLabel id="major-filter-label">View</InputLabel>
        <Select
          labelId="major-filter-label"
          value={majorFilter}
          label="View"
          onChange={handleMajorFilterChange}
        >
          <MenuItem value="character">Filter by Character</MenuItem>
          <MenuItem value="style">Filter by Style</MenuItem>
          <MenuItem value="pose">Filter by Pose</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {formatMajorFilterLabel(majorFilter)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
        Source: {library.rootPath ?? "not configured"}
      </Typography>
    </Box>
  );

  const characterBrowseView = (
    <Stack spacing={2}>
      <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
        {library.styles.map((style) => (
          <Chip
            key={style}
            label={style}
            color={browseStyle === style ? "primary" : "default"}
            onClick={() => setBrowseStyle(style)}
          />
        ))}
      </Stack>

      {selectedCharacter ? (
        <>
          <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
            <Chip
              label="All styles"
              color={characterDetailStyle === "all" ? "primary" : "default"}
              onClick={() => setCharacterDetailStyle("all")}
            />
            {library.styles.map((style) => (
              <Chip
                key={style}
                label={style}
                color={characterDetailStyle === style ? "primary" : "default"}
                onClick={() => setCharacterDetailStyle(style)}
              />
            ))}
          </Stack>

          <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
            <Chip
              label="All poses"
              color={characterDetailPose === "all" ? "secondary" : "default"}
              onClick={() => setCharacterDetailPose("all")}
            />
            {characterDetailPoseOptions.map((pose) => (
              <Chip
                key={pose}
                label={pose}
                color={characterDetailPose === pose ? "secondary" : "default"}
                onClick={() => setCharacterDetailPose(pose)}
              />
            ))}
          </Stack>

          <Chip
            label="Back to characters"
            variant="outlined"
            onClick={() => setSelectedCharacter(null)}
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
              character.thumbnailsByStyle[library.defaultStyle] ??
              Object.values(character.thumbnailsByStyle)[0];

            return (
              <Card key={character.name}>
                <CardActionArea onClick={() => setSelectedCharacter(character.name)}>
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
                      <Box
                        component="img"
                        src={getImageUrl(thumbnailPath)}
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

  const styleView = (
    <Stack spacing={2}>
      <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
        {library.styles.map((style) => (
          <Chip
            key={style}
            label={style}
            color={styleViewStyle === style ? "primary" : "default"}
            onClick={() => {
              setStyleViewStyle(style);
              setStyleViewCharacter("all");
              setStyleViewPose("all");
            }}
          />
        ))}
      </Stack>

      <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
        <Chip
          label="All characters"
          color={styleViewCharacter === "all" ? "secondary" : "default"}
          onClick={() => setStyleViewCharacter("all")}
        />
        {styleViewCharacters.map((characterName) => (
          <Chip
            key={characterName}
            label={characterName}
            color={styleViewCharacter === characterName ? "secondary" : "default"}
            onClick={() => setStyleViewCharacter(characterName)}
          />
        ))}
      </Stack>

      <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
        <Chip
          label="All poses"
          color={styleViewPose === "all" ? "secondary" : "default"}
          onClick={() => setStyleViewPose("all")}
        />
        {styleViewPoses.map((poseName) => (
          <Chip
            key={poseName}
            label={poseName}
            color={styleViewPose === poseName ? "secondary" : "default"}
            onClick={() => setStyleViewPose(poseName)}
          />
        ))}
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {styleFilteredImages.map((image) => (
          <ImageCard key={image.id} image={image} />
        ))}
      </Box>
    </Stack>
  );

  const poseView = (
    <Stack spacing={2}>
      <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
        <Chip
          label="All poses"
          color={poseViewPose === "all" ? "primary" : "default"}
          onClick={() => setPoseViewPose("all")}
        />
        {allPoseOptions.map((poseName) => (
          <Chip
            key={poseName}
            label={poseName}
            color={poseViewPose === poseName ? "primary" : "default"}
            onClick={() => setPoseViewPose(poseName)}
          />
        ))}
      </Stack>

      <Stack   spacing={{ xs: 1, sm: 2 }}
  direction="row"
  useFlexGap
  sx={{ flexWrap: 'wrap' }}>
        <Chip
          label="All styles"
          color={poseViewStyle === "all" ? "secondary" : "default"}
          onClick={() => setPoseViewStyle("all")}
        />
        {library.styles.map((style) => (
          <Chip
            key={style}
            label={style}
            color={poseViewStyle === style ? "secondary" : "default"}
            onClick={() => setPoseViewStyle(style)}
          />
        ))}
      </Stack>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={poseViewCharacter}
        onChange={(_event, nextValue: string | null) => {
          if (nextValue) {
            setPoseViewCharacter(nextValue);
          }
        }}
        sx={{ flexWrap: "wrap" }}
      >
        <ToggleButton value="all">All characters</ToggleButton>
        {allCharacterOptions.map((characterName) => (
          <ToggleButton key={characterName} value={characterName}>
            {characterName}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {poseFilteredImages.map((image) => (
          <ImageCard key={image.id} image={image} />
        ))}
      </Box>
    </Stack>
  );

  const bodyContent = (() => {
    if (isLoading) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 12 }}>
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
      return characterBrowseView;
    }

    if (majorFilter === "style") {
      return styleView;
    }

    return poseView;
  })();

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
        {sideMenu}
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
        {sideMenu}
      </Drawer>

      <Box component="main" sx={{ ml: { sm: `${SIDEBAR_WIDTH}px` }, p: { xs: 2, sm: 3 } }}>
        <Toolbar sx={{ display: { xs: "flex", sm: "none" } }} />
        {heroContent}
        {bodyContent}
      </Box>
    </Box>
  );
}
