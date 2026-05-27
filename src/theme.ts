"use client";
import { createTheme } from "@mui/material/styles";

const APP_THEME = {
  palette: {
    primary: {
      main: "#1f6feb",
    },
    secondary: {
      main: "#f97316",
    },
    background: {
      default: "#f5f7fb",
      paper: "#ffffff",
    },
  },
};

const theme = createTheme({
  ...APP_THEME,
  cssVariables: {
    colorSchemeSelector: "class",
  },
  shape: {
    borderRadius: 12,
  },
  colorSchemes: { light: true, dark: true },
  typography: {
    fontFamily: '"Lexend", "Segoe UI", sans-serif',
  },
});

export default theme;
