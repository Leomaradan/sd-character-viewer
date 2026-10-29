"use client";

import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import CasinoIcon from "@mui/icons-material/Casino";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MenuIcon from "@mui/icons-material/Menu";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from "react";

import type {
  IImageItem,
  ILibraryData,
  TCharacterSortOrder,
  TMajorFilter,
  TMediaTypeFilter,
  TRating,
  TRatingFilter,
} from "@/types/library";

import { SIDEBAR_WIDTH, DEFAULT_LIBRARY } from "@/components/image-viewer/common/constants";
import {
  buildNextQueryString,
  metadataFilterIdToQueryChanges,
  normalizePoseFilters,
  parseCharacterSortOrder,
  parseMediaTypeFilter,
  parseRatingFilter,
  parseShowOnlyUpscaled,
  parsePoseViewStyle,
  parseShowOnlyNewImages,
  parseSelectedMetadataFilterId,
  parseSelectedPoseFilters,
  parseStyleViewStyle,
  parseWithActionFilter,
} from "@/components/image-viewer/common/persistent-filters";
import {
  applyPendingActionOverride,
  applyRatingOverride,
  formatStyleLabel,
  pickRandomItem,
} from "@/components/image-viewer/common/utils";
import { ImageDetailModal } from "@/components/image-viewer/details/ImageDetailModal";
import { DuplicateFinderModal } from "@/components/image-viewer/duplicateFinder/DuplicateFinderModal";
import { ScrollToTopButton } from "@/components/image-viewer/layout/ScrollToTopButton";
import { SideMenu } from "@/components/image-viewer/layout/SideMenu";
import { PoseConformityModal } from "@/components/image-viewer/poseConformity/PoseConformityModal";
import {
  LibraryToolboxModal,
  type ILibraryTool,
} from "@/components/image-viewer/toolbox/LibraryToolboxModal";

import { ImageViewerBody } from "./ImageViewerBody";

const MAIN_STYLES = { minHeight: "100vh", bgcolor: "background.default" };
const APP_BAR_STYLES = {
  borderBottom: "1px solid",
  borderColor: "divider",
};
const APP_TOOLBAR_STYLES = { mr: 2, display: { xs: "flex", sm: "none" } };
const DESKTOP_TOGGLE_SX = { mr: 2, display: { xs: "none", sm: "flex" } };
const APP_TITLE_SX = { flexGrow: 1, fontWeight: 700 };

const MODAL_PROPS = { keepMounted: true };
const MODAL_STYLES = {
  display: { xs: "block", sm: "none" },
  [`& .MuiDrawer-paper`]: {
    width: SIDEBAR_WIDTH,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  },
};

const DRAWER_STYLES = {
  display: { xs: "none", sm: "block" },
  width: SIDEBAR_WIDTH,
  flexShrink: 0,
  [`& .MuiDrawer-paper`]: {
    width: SIDEBAR_WIDTH,
    boxSizing: "border-box",
    zIndex: 1099,
    display: "flex",
    flexDirection: "column",
  },
};

const AUTH_PAGE_SX = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  p: 2,
  bgcolor: "background.default",
};
const AUTH_CARD_SX = { width: "100%", maxWidth: 460 };
const AUTH_LOADING_SX = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  bgcolor: "background.default",
};

const AUTH_LOCAL_EXPIRY_KEY = "sd_auth_expires_at";
const AUTH_SESSION_KEY = "sd_auth_session";
const AUTH_MARKER_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
// Query-string flag of a detail view opened by the dice button (random mode).
const RANDOM_QUERY_PARAM = "random";

interface IAuthSessionResponse {
  misconfigured?: boolean;
  required: boolean;
  authenticated: boolean;
}

type TAuthStatus = "checking" | "misconfigured" | "required" | "authenticated" | "error";

interface IImageViewerAppProps {
  canDeleteImage?: boolean;
  appVersion?: string;
}

export const ImageViewerApp = ({ canDeleteImage = false, appVersion }: IImageViewerAppProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawView = searchParams.get("view");
  const majorFilter: TMajorFilter =
    rawView === "style" || rawView === "pose" ? rawView : "character";
  const rawChar = searchParams.get("char");
  const selectedCharacter = majorFilter === "character" ? rawChar : null;
  const selectedPoseFilters = useMemo(() => parseSelectedPoseFilters(searchParams), [searchParams]);
  const showOnlyNewImages = useMemo(() => parseShowOnlyNewImages(searchParams), [searchParams]);
  const characterSortOrder = useMemo(() => parseCharacterSortOrder(searchParams), [searchParams]);
  const mediaTypeFilter = useMemo(() => parseMediaTypeFilter(searchParams), [searchParams]);
  const ratingFilter = useMemo(() => parseRatingFilter(searchParams), [searchParams]);
  const withAction = useMemo(() => parseWithActionFilter(searchParams), [searchParams]);
  const showOnlyUpscaled = useMemo(() => parseShowOnlyUpscaled(searchParams), [searchParams]);
  const styleViewStyle = useMemo(() => parseStyleViewStyle(searchParams), [searchParams]);
  const poseViewStyle = useMemo(() => parsePoseViewStyle(searchParams), [searchParams]);
  const selectedMetadataFilterId = useMemo(
    () => parseSelectedMetadataFilterId(searchParams),
    [searchParams],
  );

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedImageForModal, setSelectedImageForModal] = useState<IImageItem | null>(null);
  // Opened by the dice button: Next picks another random file and there's no Previous. Also
  // reflected as `random=1` on the detail view's history entry, so closing it drops the flag.
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [modalFilteredImages, setModalFilteredImages] = useState<IImageItem[]>([]);
  const [isDuplicateFinderOpen, setIsDuplicateFinderOpen] = useState(false);
  const [isPoseConformityOpen, setIsPoseConformityOpen] = useState(false);
  const [isLibraryToolboxOpen, setIsLibraryToolboxOpen] = useState(false);
  const [library, setLibrary] = useState<ILibraryData>(DEFAULT_LIBRARY);
  const modalHistoryPushed = useRef(false);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const [randomRequestToken, setRandomRequestToken] = useState(0);
  // Images marked as seen since the last library load, so the grids (which keep their own copy of
  // the library) drop their "new" state without refetching it.
  const [seenRelativePaths, setSeenRelativePaths] = useState<ReadonlySet<string>>(new Set());
  // Same idea for ratings set in the detail view (null = cleared).
  const [ratingOverrides, setRatingOverrides] = useState<ReadonlyMap<string, TRating | null>>(
    new Map(),
  );
  // And for Upscale/Animate/Extend marks set or cleared in the detail view.
  const [pendingActionOverrides, setPendingActionOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  const [authStatus, setAuthStatus] = useState<TAuthStatus>("checking");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [characterDetailStyle, setCharacterDetailStyle] = useState<string>("--all--");
  const [characterDetailPose, setCharacterDetailPose] = useState<string>("--all--");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [majorFilter, selectedCharacter]);

  const updateQueryParams = useCallback(
    (changes: Record<string, string | string[] | null>) => {
      const nextQuery = buildNextQueryString(searchParams, changes);
      router.push(nextQuery ? `/?${nextQuery}` : "/");
    },
    [router, searchParams],
  );

  const handleOpenMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  const handleRandomClick = useCallback(() => {
    setRandomRequestToken((currentToken) => currentToken + 1);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const mainContentSx = useMemo(
    () => ({
      ml: isSidebarCollapsed ? 0 : { sm: `${SIDEBAR_WIDTH}px` },
      p: { xs: 2, sm: 3 },
      transition: "margin-left 0.2s ease",
    }),
    [isSidebarCollapsed],
  );

  const handleOpenImageModal = useCallback(
    (image: IImageItem, filteredImages: IImageItem[], isRandom: boolean = false) => {
      setModalFilteredImages(filteredImages);
      setSelectedImageForModal(image);
      setIsRandomMode(isRandom);
      if (isRandom) {
        const url = new URL(globalThis.location.href);
        url.searchParams.set(RANDOM_QUERY_PARAM, "1");
        history.pushState({ sdModal: true }, "", url);
      } else {
        history.pushState({ sdModal: true }, "");
      }
      modalHistoryPushed.current = true;
    },
    [],
  );

  // A `random` flag left in the URL (page reloaded while the random detail view was open) has no
  // detail view to go with it any more.
  useEffect(() => {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.has(RANDOM_QUERY_PARAM)) {
      url.searchParams.delete(RANDOM_QUERY_PARAM);
      history.replaceState(history.state, "", url);
    }
  }, []);

  const handleCloseImageModal = useCallback(() => {
    setSelectedImageForModal(null);
    setModalFilteredImages([]);
    setIsRandomMode(false);
    if (modalHistoryPushed.current) {
      modalHistoryPushed.current = false;
      history.back();
    }
  }, []);

  const handleOpenLibraryToolbox = useCallback(() => {
    closeMobileDrawer();
    setIsLibraryToolboxOpen(true);
  }, [closeMobileDrawer]);

  const handleCloseLibraryToolbox = useCallback(() => {
    setIsLibraryToolboxOpen(false);
  }, []);

  const handleOpenDuplicateFinder = useCallback(() => {
    setIsDuplicateFinderOpen(true);
  }, []);

  const handleOpenPoseConformity = useCallback(() => {
    setIsPoseConformityOpen(true);
  }, []);

  const handleClosePoseConformity = useCallback(() => {
    setIsPoseConformityOpen(false);
  }, []);

  const hasStandardPoses = library.standardPoses.length > 0;

  const libraryTools = useMemo<ILibraryTool[]>(() => {
    const tools: ILibraryTool[] = [
      {
        id: "duplicate-finder",
        name: "Duplicate Finder",
        description: "Review images sharing the same pose and keep only the ones you want.",
        icon: <ContentCopyIcon />,
        onOpen: handleOpenDuplicateFinder,
      },
    ];

    // Only offered once config.json lists standard poses to check against.
    if (hasStandardPoses) {
      tools.push({
        id: "pose-conformity",
        name: "Pose Conformity",
        description: "Find files whose pose isn't a standard pose, and rename or keep them.",
        icon: <AccessibilityNewIcon />,
        onOpen: handleOpenPoseConformity,
      });
    }

    return tools;
  }, [handleOpenDuplicateFinder, handleOpenPoseConformity, hasStandardPoses]);

  const handleCloseDuplicateFinder = useCallback(() => {
    setIsDuplicateFinderOpen(false);
  }, []);

  const handleDuplicateChangesApplied = useCallback(() => {
    setLibraryRefreshToken((currentToken) => currentToken + 1);
  }, []);

  const handleImageSeen = useCallback((relativePath: string) => {
    const markSeen = (item: IImageItem): IImageItem =>
      item.relativePath === relativePath && item.isNew ? { ...item, isNew: false } : item;

    setLibrary((currentLibrary) => ({
      ...currentLibrary,
      images: currentLibrary.images.map(markSeen),
    }));
    setModalFilteredImages((currentImages) => currentImages.map(markSeen));
    setSeenRelativePaths((current) => new Set(current).add(relativePath));
    setSelectedImageForModal((currentImage) =>
      currentImage?.relativePath === relativePath
        ? { ...currentImage, isNew: false }
        : currentImage,
    );
  }, []);

  // The rating is already saved server-side; mirror it locally instead of reloading the library.
  const handleImageRated = useCallback((relativePath: string, rating: TRating | null) => {
    const overrides = new Map([[relativePath, rating]]);
    const applyRating = (item: IImageItem): IImageItem => applyRatingOverride(item, overrides);

    setLibrary((currentLibrary) => ({
      ...currentLibrary,
      images: currentLibrary.images.map(applyRating),
    }));
    setModalFilteredImages((currentImages) => currentImages.map(applyRating));
    setSelectedImageForModal((currentImage) => currentImage && applyRating(currentImage));
    setRatingOverrides((current) => new Map(current).set(relativePath, rating));
  }, []);

  // Same for a mark set or cleared in the detail view, so the "With action" filter follows it.
  const handleImagePendingActionChange = useCallback(
    (relativePath: string, hasPendingAction: boolean) => {
      const overrides = new Map([[relativePath, hasPendingAction]]);
      const applyPendingAction = (item: IImageItem): IImageItem =>
        applyPendingActionOverride(item, overrides);

      setLibrary((currentLibrary) => ({
        ...currentLibrary,
        images: currentLibrary.images.map(applyPendingAction),
      }));
      setModalFilteredImages((currentImages) => currentImages.map(applyPendingAction));
      setSelectedImageForModal((currentImage) => currentImage && applyPendingAction(currentImage));
      setPendingActionOverrides((current) => new Map(current).set(relativePath, hasPendingAction));
    },
    [],
  );

  // A related file picked in the detail view replaces the shown one; previous/next keep working
  // when it's part of the grid the modal was opened from.
  const handleOpenRelatedImage = useCallback((image: IImageItem) => {
    setSelectedImageForModal(image);
  }, []);

  const handleImageDeleted = useCallback(() => {
    setSelectedImageForModal(null);
    setModalFilteredImages([]);
    setIsRandomMode(false);
    if (modalHistoryPushed.current) {
      modalHistoryPushed.current = false;
      history.back();
    }
    setLibraryRefreshToken((currentToken) => currentToken + 1);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (modalHistoryPushed.current) {
        modalHistoryPushed.current = false;
        setSelectedImageForModal(null);
        setModalFilteredImages([]);
        setIsRandomMode(false);
      }
    };
    globalThis.addEventListener("popstate", handlePopState);
    return () => {
      globalThis.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const storeAuthMarkers = useCallback(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const expiresAt = Date.now() + AUTH_MARKER_MAX_AGE_MS;
    globalThis.sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    globalThis.localStorage.setItem(AUTH_LOCAL_EXPIRY_KEY, String(expiresAt));
  }, []);

  const syncStoredAuthMarker = useCallback(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const storedExpiry = globalThis.localStorage.getItem(AUTH_LOCAL_EXPIRY_KEY);
    if (!storedExpiry) {
      return;
    }

    const expiresAt = Number(storedExpiry);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      globalThis.localStorage.removeItem(AUTH_LOCAL_EXPIRY_KEY);
      globalThis.sessionStorage.removeItem(AUTH_SESSION_KEY);
      return;
    }

    globalThis.sessionStorage.setItem(AUTH_SESSION_KEY, "1");
  }, []);

  const loadAuthSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not check auth session.");
      }

      const data: IAuthSessionResponse = await response.json();

      if (data.misconfigured) {
        setAuthStatus("misconfigured");
        return;
      }

      const nextStatus = data.required && !data.authenticated ? "required" : "authenticated";

      setAuthStatus(nextStatus);
      setAuthError(null);

      if (nextStatus === "authenticated") {
        storeAuthMarkers();
      }
    } catch {
      setAuthStatus("error");
      setAuthError("Could not verify authentication session.");
    }
  }, [storeAuthMarkers]);

  const handlePasswordInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPasswordInput(event.target.value);
  }, []);

  const handleRetryAuthSession = useCallback(() => {
    setAuthStatus("checking");
    void loadAuthSession();
  }, [loadAuthSession]);

  const handlePasswordSubmit = useCallback(
    async (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      const password = passwordInput.trim();
      if (!password) {
        setAuthError("Enter the password.");
        return;
      }

      try {
        setIsAuthenticating(true);

        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({ password }),
        });

        if (!response.ok) {
          setAuthError("Invalid password.");
          return;
        }

        storeAuthMarkers();
        setPasswordInput("");
        setAuthError(null);
        setAuthStatus("authenticated");
      } catch {
        setAuthError("Could not authenticate. Try again.");
      } finally {
        setIsAuthenticating(false);
      }
    },
    [passwordInput, storeAuthMarkers],
  );

  useEffect(() => {
    syncStoredAuthMarker();
  }, [syncStoredAuthMarker]);

  useEffect(() => {
    const timer = globalThis.window.setTimeout(() => {
      void loadAuthSession();
    }, 0);

    return () => {
      globalThis.window.clearTimeout(timer);
    };
  }, [loadAuthSession]);

  const handleMajorFilterChange = useCallback(
    (nextFilter: TMajorFilter) => {
      closeMobileDrawer();
      setCharacterDetailStyle("--all--");
      setCharacterDetailPose("--all--");
      updateQueryParams({ view: nextFilter, char: null });
    },
    [closeMobileDrawer, updateQueryParams],
  );

  const handleSelectCharacter = useCallback(
    (characterName: string | null) => {
      setCharacterDetailStyle("--all--");
      setCharacterDetailPose("--all--");
      if (characterName === null) {
        updateQueryParams({ view: "character", char: null });
      } else {
        updateQueryParams({ view: "character", char: characterName });
      }
    },
    [updateQueryParams],
  );

  const handleMetadataFilterChange = useCallback(
    (metadataFilterId: string) => {
      updateQueryParams(metadataFilterIdToQueryChanges(metadataFilterId));
    },
    [updateQueryParams],
  );

  const handlePoseFiltersChange = useCallback(
    (nextPoseFilters: string[] | ((prev: string[]) => string[])) => {
      const poseFilters =
        typeof nextPoseFilters === "function"
          ? nextPoseFilters(selectedPoseFilters)
          : nextPoseFilters;
      updateQueryParams({ pose: normalizePoseFilters(poseFilters) });
    },
    [updateQueryParams, selectedPoseFilters],
  );

  const handleShowOnlyNewImagesChange = useCallback(
    (enabled: boolean) => {
      updateQueryParams({ new: enabled ? "1" : null });
    },
    [updateQueryParams],
  );

  const handleCharacterSortOrderChange = useCallback(
    (nextSortOrder: TCharacterSortOrder) => {
      updateQueryParams({ sort: nextSortOrder === "date" ? "date" : null });
    },
    [updateQueryParams],
  );

  const handleShowOnlyUpscaledChange = useCallback(
    (enabled: boolean) => {
      updateQueryParams({ upscaled: enabled ? "1" : null });
    },
    [updateQueryParams],
  );

  const handleMediaTypeFilterChange = useCallback(
    (nextMediaTypeFilter: TMediaTypeFilter) => {
      updateQueryParams({ media: nextMediaTypeFilter === "both" ? null : nextMediaTypeFilter });
    },
    [updateQueryParams],
  );

  const handleRatingFilterChange = useCallback(
    (nextRatingFilter: TRatingFilter) => {
      updateQueryParams({ rating: [...nextRatingFilter] });
    },
    [updateQueryParams],
  );

  const handleWithActionChange = useCallback(
    (nextWithAction: boolean) => {
      updateQueryParams({ action: nextWithAction ? "1" : null });
    },
    [updateQueryParams],
  );

  const handleStyleViewStyleChange = useCallback(
    (nextStyle: string) => {
      updateQueryParams({ styleTab: nextStyle || null });
    },
    [updateQueryParams],
  );

  const handlePoseViewStyleChange = useCallback(
    (nextStyle: string) => {
      updateQueryParams({ poseStyle: nextStyle === "--all--" ? null : nextStyle });
    },
    [updateQueryParams],
  );

  const modalImageIndexById = useMemo(() => {
    return new Map(modalFilteredImages.map((image, index) => [image.id, index]));
  }, [modalFilteredImages]);

  const selectedModalImageIndex = useMemo(() => {
    if (!selectedImageForModal) {
      return -1;
    }

    return modalImageIndexById.get(selectedImageForModal.id) ?? -1;
  }, [modalImageIndexById, selectedImageForModal]);

  const canNavigateModalPrevious = !isRandomMode && selectedModalImageIndex > 0;
  const canNavigateModalNext = isRandomMode
    ? modalFilteredImages.length > 1
    : selectedModalImageIndex >= 0 && selectedModalImageIndex < modalFilteredImages.length - 1;

  const handleModalPrevious = useCallback(() => {
    if (!canNavigateModalPrevious) {
      return;
    }

    setSelectedImageForModal(modalFilteredImages[selectedModalImageIndex - 1] ?? null);
  }, [canNavigateModalPrevious, modalFilteredImages, selectedModalImageIndex]);

  const handleModalNext = useCallback(() => {
    if (!canNavigateModalNext) {
      return;
    }

    if (isRandomMode) {
      // Another random file, never the one already shown.
      const others = modalFilteredImages.filter((_, index) => index !== selectedModalImageIndex);
      setSelectedImageForModal(pickRandomItem(others));
      return;
    }

    setSelectedImageForModal(modalFilteredImages[selectedModalImageIndex + 1] ?? null);
  }, [canNavigateModalNext, isRandomMode, modalFilteredImages, selectedModalImageIndex]);

  // Redraw renamed the shown file: drop it from the list and move on to the next (or another
  // random) file, closing when there's none left. The library reloads to pick up the new name.
  const handleImageRedrawn = useCallback(
    (relativePath: string) => {
      const remaining = modalFilteredImages.filter((item) => item.relativePath !== relativePath);
      const nextImage = isRandomMode
        ? pickRandomItem(remaining)
        : (modalFilteredImages[selectedModalImageIndex + 1] ?? null);

      if (nextImage) {
        setModalFilteredImages(remaining);
        setSelectedImageForModal(nextImage);
        setLibraryRefreshToken((currentToken) => currentToken + 1);
        return;
      }

      handleImageDeleted();
    },
    [handleImageDeleted, isRandomMode, modalFilteredImages, selectedModalImageIndex],
  );

  const handleLibraryLoad = useCallback((loadedLibrary: ILibraryData) => {
    setLibrary(loadedLibrary);
  }, []);

  // The Library Toolbox tools start on the style shown by the Styles view (same fallback as
  // ImageViewerBody), and on all styles from any other view.
  let toolInitialStyle = "";
  if (majorFilter === "style") {
    toolInitialStyle = library.styles.includes(styleViewStyle)
      ? styleViewStyle
      : library.defaultStyle;
  }

  const styleLabel = useCallback(
    (style: string) => formatStyleLabel(style, library.styleLabels),
    [library.styleLabels],
  );

  if (authStatus === "checking") {
    return (
      <Box sx={AUTH_LOADING_SX}>
        <CircularProgress />
      </Box>
    );
  }

  if (authStatus === "misconfigured") {
    return (
      <Box sx={AUTH_PAGE_SX}>
        <Card elevation={2} sx={AUTH_CARD_SX}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h5">Configuration error</Typography>
              <Alert severity="error">
                <strong>SD_PASSWORD</strong> is set but <strong>SD_PASSWORD_SALT</strong> is
                missing. Add <code>SD_PASSWORD_SALT</code> to your environment to enable login.
              </Alert>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <Box sx={AUTH_PAGE_SX}>
        <Card elevation={2} sx={AUTH_CARD_SX}>
          <CardContent>
            <Stack spacing={2} component="form" onSubmit={handlePasswordSubmit}>
              <Typography variant="h5">Protected Gallery</Typography>
              <Typography variant="body2" color="text.secondary">
                Enter the gallery password to continue.
              </Typography>

              {authError ? <Alert severity="error">{authError}</Alert> : null}

              <TextField
                type="password"
                label="Password"
                value={passwordInput}
                onChange={handlePasswordInputChange}
                autoComplete="current-password"
                fullWidth
              />

              <Button type="submit" variant="contained" disabled={isAuthenticating}>
                {isAuthenticating ? "Checking..." : "Unlock"}
              </Button>

              <Button variant="text" onClick={handleRetryAuthSession} disabled={isAuthenticating}>
                Retry session check
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={MAIN_STYLES}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={APP_BAR_STYLES}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="open drawer"
            onClick={handleOpenMobileDrawer}
            sx={APP_TOOLBAR_STYLES}
          >
            <MenuIcon />
          </IconButton>

          <IconButton
            color="inherit"
            edge="start"
            onClick={handleToggleSidebar}
            sx={DESKTOP_TOGGLE_SX}
          >
            {isSidebarCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
          </IconButton>

          <Typography variant="h6" noWrap sx={APP_TITLE_SX}>
            Stable Diffusion Character Viewer
          </Typography>

          <Tooltip
            title={
              selectedCharacter || majorFilter !== "character" ? "Random media" : "Random character"
            }
          >
            <IconButton
              color="inherit"
              edge="end"
              aria-label="pick random"
              onClick={handleRandomClick}
            >
              <CasinoIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={isMobileDrawerOpen}
        onClose={closeMobileDrawer}
        ModalProps={MODAL_PROPS}
        sx={MODAL_STYLES}
      >
        <Toolbar />
        <SideMenu
          majorFilter={majorFilter}
          onMajorFilterChange={handleMajorFilterChange}
          showOnlyNewImages={showOnlyNewImages}
          onShowOnlyNewImagesChange={handleShowOnlyNewImagesChange}
          characterSortOrder={characterSortOrder}
          onCharacterSortOrderChange={handleCharacterSortOrderChange}
          library={library}
          canUseLibraryTools={canDeleteImage}
          onOpenLibraryToolbox={handleOpenLibraryToolbox}
          appVersion={appVersion}
        />
      </Drawer>

      {!isSidebarCollapsed && (
        <Drawer variant="permanent" open sx={DRAWER_STYLES}>
          <Toolbar />
          <SideMenu
            majorFilter={majorFilter}
            onMajorFilterChange={handleMajorFilterChange}
            showOnlyNewImages={showOnlyNewImages}
            onShowOnlyNewImagesChange={handleShowOnlyNewImagesChange}
            characterSortOrder={characterSortOrder}
            onCharacterSortOrderChange={handleCharacterSortOrderChange}
            library={library}
            canUseLibraryTools={canDeleteImage}
            onOpenLibraryToolbox={handleOpenLibraryToolbox}
            appVersion={appVersion}
          />
        </Drawer>
      )}

      <Box component="main" sx={mainContentSx}>
        <Toolbar />
        <ImageViewerBody
          majorFilter={majorFilter}
          selectedCharacter={selectedCharacter}
          selectedPoseFilters={selectedPoseFilters}
          selectedMetadataFilterId={selectedMetadataFilterId}
          showOnlyNewImages={showOnlyNewImages}
          characterSortOrder={characterSortOrder}
          mediaTypeFilter={mediaTypeFilter}
          ratingFilter={ratingFilter}
          withAction={withAction}
          showOnlyUpscaled={showOnlyUpscaled}
          styleViewStyle={styleViewStyle}
          poseViewStyle={poseViewStyle}
          characterDetailStyle={characterDetailStyle}
          characterDetailPose={characterDetailPose}
          reloadToken={libraryRefreshToken}
          randomRequestToken={randomRequestToken}
          seenRelativePaths={seenRelativePaths}
          ratingOverrides={ratingOverrides}
          pendingActionOverrides={pendingActionOverrides}
          setSelectedCharacter={handleSelectCharacter}
          setSelectedPoseFilters={handlePoseFiltersChange}
          setSelectedMetadataFilterId={handleMetadataFilterChange}
          setStyleViewStyle={handleStyleViewStyleChange}
          setPoseViewStyle={handlePoseViewStyleChange}
          setCharacterDetailStyle={setCharacterDetailStyle}
          setCharacterDetailPose={setCharacterDetailPose}
          onMediaTypeFilterChange={handleMediaTypeFilterChange}
          onRatingFilterChange={handleRatingFilterChange}
          onWithActionChange={handleWithActionChange}
          onShowOnlyUpscaledChange={handleShowOnlyUpscaledChange}
          onImageSelect={handleOpenImageModal}
          onLibraryLoad={handleLibraryLoad}
        />
      </Box>

      <ImageDetailModal
        image={selectedImageForModal}
        canDeleteImage={canDeleteImage}
        onClose={handleCloseImageModal}
        onDeleteSuccess={handleImageDeleted}
        onImageSeen={handleImageSeen}
        onImageRated={handleImageRated}
        onImagePendingActionChange={handleImagePendingActionChange}
        libraryImages={library.images}
        onOpenRelatedImage={handleOpenRelatedImage}
        onImageRedrawn={handleImageRedrawn}
        isRandomMode={isRandomMode}
        canNavigatePrevious={canNavigateModalPrevious}
        canNavigateNext={canNavigateModalNext}
        onNavigatePrevious={handleModalPrevious}
        onNavigateNext={handleModalNext}
        styleLabel={styleLabel}
        animations={library.animations}
      />

      <LibraryToolboxModal
        open={isLibraryToolboxOpen}
        onClose={handleCloseLibraryToolbox}
        tools={libraryTools}
      />

      <DuplicateFinderModal
        open={isDuplicateFinderOpen}
        onClose={handleCloseDuplicateFinder}
        onChangesApplied={handleDuplicateChangesApplied}
        styleLabel={styleLabel}
        initialStyle={toolInitialStyle}
      />

      <PoseConformityModal
        open={isPoseConformityOpen}
        onClose={handleClosePoseConformity}
        onChangesApplied={handleDuplicateChangesApplied}
        styleLabel={styleLabel}
        initialStyle={toolInitialStyle}
        initialMediaTypeFilter={mediaTypeFilter}
      />

      <ScrollToTopButton />
    </Box>
  );
};
