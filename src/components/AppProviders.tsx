"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { type PropsWithChildren, useMemo } from "react";

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

export function AppProviders({ children }: Readonly<PropsWithChildren>) {
  const theme = useMemo(() => {
    return createTheme({
      ...APP_THEME,
      shape: {
        borderRadius: 12,
      },
      typography: {
        fontFamily: '"Lexend", "Segoe UI", sans-serif',
      },
    });
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
