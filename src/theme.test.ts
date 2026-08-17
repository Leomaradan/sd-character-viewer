import { describe, expect, it } from "vitest";
import theme from "@/theme";

describe("theme", () => {
  it("configures the app palette and shape", () => {
    expect(theme.palette.primary.main).toBe("#1f6feb");
    expect(theme.palette.secondary.main).toBe("#f97316");
    expect(theme.shape.borderRadius).toBe(12);
  });

  it("enables light and dark color schemes", () => {
    const themeWithColorSchemes = theme as unknown as {
      colorSchemes: Record<"light" | "dark", unknown>;
    };
    expect(themeWithColorSchemes.colorSchemes.light).toBeTruthy();
    expect(themeWithColorSchemes.colorSchemes.dark).toBeTruthy();
  });
});
