"use client";

import { AppBar, Box, Drawer, IconButton, Toolbar, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { useCallback, useState } from "react";
import { SIDEBAR_WIDTH } from "@/components/image-viewer/constants";
import { HeroCard } from "@/components/image-viewer/HeroCard";
import { SideMenu } from "@/components/image-viewer/SideMenu";
import type { IImageItem, TMajorFilter, TStyle } from "@/types/library";
import { ImageViewerBody } from "./ImageViewerBody";
import { ImageDetailModal } from "@/components/image-viewer/ImageDetailModal";

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

export const ImageViewerApp = () => {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [selectedImageForModal, setSelectedImageForModal] = useState<IImageItem | null>(null);

  const [majorFilter, setMajorFilter] = useState<TMajorFilter>("character");

  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [characterDetailStyle, setCharacterDetailStyle] = useState<"all" | TStyle>("all");
  const [characterDetailPose, setCharacterDetailPose] = useState<string>("all");

  const handleOpenMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(true);
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen(false);
  }, []);

  const handleCloseImageModal = useCallback(() => {
    setSelectedImageForModal(null);
  }, []);

  const handleMajorFilterChange = useCallback(
    (nextFilter: TMajorFilter) => {
      setMajorFilter(nextFilter);
      closeMobileDrawer();

      if (nextFilter !== "character") {
        setSelectedCharacter(null);
        setCharacterDetailStyle("all");
        setCharacterDetailPose("all");
      }
    },
    [closeMobileDrawer],
  );

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
          setSelectedCharacter={setSelectedCharacter}
          setCharacterDetailStyle={setCharacterDetailStyle}
          setCharacterDetailPose={setCharacterDetailPose}
          onImageSelect={setSelectedImageForModal}
        />
      </Box>

      <ImageDetailModal image={selectedImageForModal} onClose={handleCloseImageModal} />
    </Box>
  );
};
