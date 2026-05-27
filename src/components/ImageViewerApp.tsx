"use client";

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
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SIDEBAR_WIDTH } from "@/components/image-viewer/constants";
import { HeroCard } from "@/components/image-viewer/HeroCard";
import { SideMenu } from "@/components/image-viewer/SideMenu";
import type { IImageItem, TMajorFilter, TStyle } from "@/types/library";
import { ImageViewerBody } from "./ImageViewerBody";
import { ImageDetailModal } from "@/components/image-viewer/ImageDetailModal";
import { ScrollToTopButton } from "@/components/image-viewer/ScrollToTopButton";

const MAIN_STYLES = { minHeight: "100vh", bgcolor: "background.default" };
const APP_BAR_STYLES = {
  borderBottom: "1px solid",
  borderColor: "divider",
  display: { sm: "none" },
};
const APP_TOOLBAR_STYLES = { mr: 2 };

const MODAL_PROPS = { keepMounted: true };
const MODAL_STYLES = {
  display: { xs: "block", sm: "none" },
  [`& .MuiDrawer-paper`]: {
    width: SIDEBAR_WIDTH,
    boxSizing: "border-box",
  },
};

const DRAWER_STYLES = {
  display: { xs: "none", sm: "block" },
  width: SIDEBAR_WIDTH,
  flexShrink: 0,
  [`& .MuiDrawer-paper`]: {
    width: SIDEBAR_WIDTH,
    boxSizing: "border-box",
  },
};

const MAIN_CONTENT_STYLES = { ml: { sm: `${SIDEBAR_WIDTH}px` }, p: { xs: 2, sm: 3 } };
const TOOLBAR_STYLES = { display: { xs: "flex", sm: "none" } };
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

interface IAuthSessionResponse {
  required: boolean;
  authenticated: boolean;
}

type TAuthStatus = "checking" | "required" | "authenticated" | "error";

interface IImageViewerAppProps {
  canDeleteImage?: boolean;
}

export const ImageViewerApp = ({ canDeleteImage = false }: IImageViewerAppProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawView = searchParams.get("view");
  const majorFilter: TMajorFilter =
    rawView === "style" || rawView === "pose" ? rawView : "character";
  const rawChar = searchParams.get("char");
  const selectedCharacter = majorFilter === "character" ? rawChar : null;

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [selectedImageForModal, setSelectedImageForModal] = useState<IImageItem | null>(null);
  const modalHistoryPushed = useRef(false);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const [authStatus, setAuthStatus] = useState<TAuthStatus>("checking");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [characterDetailStyle, setCharacterDetailStyle] = useState<"all" | TStyle>("all");
  const [characterDetailPose, setCharacterDetailPose] = useState<string>("all");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [majorFilter, selectedCharacter]);

  const handleOpenMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  const handleOpenImageModal = useCallback((image: IImageItem) => {
    setSelectedImageForModal(image);
    history.pushState({ sdModal: true }, "");
    modalHistoryPushed.current = true;
  }, []);

  const handleCloseImageModal = useCallback(() => {
    setSelectedImageForModal(null);
    if (modalHistoryPushed.current) {
      modalHistoryPushed.current = false;
      history.back();
    }
  }, []);

  const handleImageDeleted = useCallback(() => {
    setSelectedImageForModal(null);
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
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
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
      setCharacterDetailStyle("all");
      setCharacterDetailPose("all");
      router.push(`/?view=${nextFilter}`);
    },
    [closeMobileDrawer, router],
  );

  const handleSelectCharacter = useCallback(
    (characterName: string | null) => {
      setCharacterDetailStyle("all");
      setCharacterDetailPose("all");
      if (characterName === null) {
        router.push("/?view=character");
      } else {
        router.push(`/?view=character&char=${encodeURIComponent(characterName)}`);
      }
    },
    [router],
  );

  if (authStatus === "checking") {
    return (
      <Box sx={AUTH_LOADING_SX}>
        <CircularProgress />
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
            onClick={handleOpenMobileDrawer}
            sx={APP_TOOLBAR_STYLES}
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
        ModalProps={MODAL_PROPS}
        sx={MODAL_STYLES}
      >
        <Toolbar />
        <SideMenu majorFilter={majorFilter} onMajorFilterChange={handleMajorFilterChange} />
      </Drawer>

      <Drawer variant="permanent" open sx={DRAWER_STYLES}>
        <Toolbar />
        <SideMenu majorFilter={majorFilter} onMajorFilterChange={handleMajorFilterChange} />
      </Drawer>

      <Box component="main" sx={MAIN_CONTENT_STYLES}>
        <Toolbar sx={TOOLBAR_STYLES} />
        <HeroCard />
        <ImageViewerBody
          majorFilter={majorFilter}
          selectedCharacter={selectedCharacter}
          characterDetailStyle={characterDetailStyle}
          characterDetailPose={characterDetailPose}
          reloadToken={libraryRefreshToken}
          setSelectedCharacter={handleSelectCharacter}
          setCharacterDetailStyle={setCharacterDetailStyle}
          setCharacterDetailPose={setCharacterDetailPose}
          onImageSelect={handleOpenImageModal}
        />
      </Box>

      <ImageDetailModal
        image={selectedImageForModal}
        canDeleteImage={canDeleteImage}
        onClose={handleCloseImageModal}
        onDeleteSuccess={handleImageDeleted}
      />

      <ScrollToTopButton />
    </Box>
  );
};
