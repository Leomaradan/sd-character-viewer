export const MODE_STORAGE_KEY = "sd-mui-mode";
export const COLOR_SCHEME_STORAGE_KEY = "sd-mui-color-scheme";

export type TColorMode = "light" | "dark" | "system";
export type TColorScheme = "light" | "dark";

export const parseColorMode = (value: string | undefined): TColorMode | null => {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return null;
};

export const parseColorScheme = (value: string | undefined): TColorScheme | null => {
  if (value === "light" || value === "dark") {
    return value;
  }

  return null;
};
