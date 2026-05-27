"use client";

import { CssBaseline, ThemeProvider } from "@mui/material";
import { type PropsWithChildren } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import theme from "../theme";

const CACHE_KEY = { key: "css" };

export const AppProviders = ({ children }: Readonly<PropsWithChildren>) => {
  return (
    <AppRouterCacheProvider options={CACHE_KEY}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
};
