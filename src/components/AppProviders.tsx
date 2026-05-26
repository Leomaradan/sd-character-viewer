"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { useServerInsertedHTML } from "next/navigation";
import { type PropsWithChildren, useMemo, useState } from "react";

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

export const AppProviders = ({ children }: Readonly<PropsWithChildren>) => {
  const [{ cache, flush }] = useState(() => {
    const cacheInstance = createCache({ key: "mui" });
    cacheInstance.compat = true;

    const previousInsert = cacheInstance.insert;
    let inserted: string[] = [];

    cacheInstance.insert = (...args) => {
      const serialized = args[1];

      if (cacheInstance.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }

      return previousInsert(...args);
    };

    return {
      cache: cacheInstance,
      flush: () => {
        const previouslyInserted = inserted;
        inserted = [];
        return previouslyInserted;
      },
    };
  });

  const styles = useMemo(() => {
    const names = flush();

    if (names.length === 0) {
      return null;
    }

    let stylesString = "";

    for (const name of names) {
      stylesString += cache.inserted[name];
    }

    return { __html: stylesString };
  }, [cache.inserted, flush]);

  useServerInsertedHTML(() => {
    const names = flush();

    if (!styles) {
      return null;
    }

    const dangerousHtml = styles;

    return (
      <style
        data-emotion={`${cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={dangerousHtml}
      />
    );
  });

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
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
};
