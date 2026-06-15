import {
  COLOR_SCHEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
  parseColorMode,
  parseColorScheme,
} from "@/lib/color-scheme-storage";
import { describe, it, expect } from "vitest";

describe("color scheme storage constants", () => {
  it("exposes stable storage keys", () => {
    expect(MODE_STORAGE_KEY).toBe("sd-mui-mode");
    expect(COLOR_SCHEME_STORAGE_KEY).toBe("sd-mui-color-scheme");
  });
});

describe("parseColorMode", () => {
  it("returns valid color modes", () => {
    expect(parseColorMode("light")).toBe("light");
    expect(parseColorMode("dark")).toBe("dark");
    expect(parseColorMode("system")).toBe("system");
  });

  it("returns null for invalid values", () => {
    expect(parseColorMode(undefined)).toBeNull();
    expect(parseColorMode("")).toBeNull();
    expect(parseColorMode("LIGHT")).toBeNull();
    expect(parseColorMode("auto")).toBeNull();
  });
});

describe("parseColorScheme", () => {
  it("returns valid color schemes", () => {
    expect(parseColorScheme("light")).toBe("light");
    expect(parseColorScheme("dark")).toBe("dark");
  });

  it("returns null for invalid values", () => {
    expect(parseColorScheme(undefined)).toBeNull();
    expect(parseColorScheme("")).toBeNull();
    expect(parseColorScheme("system")).toBeNull();
    expect(parseColorScheme("DARK")).toBeNull();
  });
});
