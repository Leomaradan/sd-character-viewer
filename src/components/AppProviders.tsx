"use client";

import { CssBaseline, ThemeProvider } from "@mui/material";
import { type PropsWithChildren } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import theme from "../theme";
import {
  COLOR_SCHEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
  type TColorMode,
} from "@/lib/color-scheme-storage";

const CACHE_KEY = { key: "css" };
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

interface IStorageManagerParams {
  key: string;
}

interface IStorageManager {
  get: (defaultValue: unknown) => unknown;
  set: (value: unknown) => void;
  subscribe: (handler: (value: unknown) => void) => () => void;
}

const cookieStorageManager = ({ key }: IStorageManagerParams): IStorageManager => {
  return {
    get: (defaultValue) => {
      if (typeof document === "undefined") {
        return defaultValue;
      }

      const pairs = document.cookie.split(";").map((cookiePart) => cookiePart.trim());
      const entry = pairs.find((pair) => pair.startsWith(`${key}=`));

      if (!entry) {
        return defaultValue;
      }

      const value = entry.slice(key.length + 1);

      try {
        return decodeURIComponent(value);
      } catch {
        return defaultValue;
      }
    },
    set: (value) => {
      if (typeof document === "undefined") {
        return;
      }

      const stringValue = String(value);
      const encodedValue = encodeURIComponent(stringValue);
      document.cookie = `${key}=${encodedValue}; Path=/; Max-Age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`;
      localStorage.setItem(key, stringValue);
    },
    subscribe: (handler) => {
      if (globalThis.window === undefined) {
        return () => {};
      }

      const onStorageEvent = (event: StorageEvent) => {
        if (event.key === key) {
          handler(event.newValue);
        }
      };

      globalThis.addEventListener("storage", onStorageEvent);
      return () => {
        globalThis.removeEventListener("storage", onStorageEvent);
      };
    },
  };
};

interface IAppProvidersProps extends PropsWithChildren {
  defaultMode: TColorMode;
}

export const AppProviders = ({ children, defaultMode }: Readonly<IAppProvidersProps>) => {
  return (
    <AppRouterCacheProvider options={CACHE_KEY}>
      <ThemeProvider
        theme={theme}
        defaultMode={defaultMode}
        modeStorageKey={MODE_STORAGE_KEY}
        colorSchemeStorageKey={COLOR_SCHEME_STORAGE_KEY}
        storageManager={cookieStorageManager}
      >
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
};
