// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SideMenu } from "@/components/image-viewer/SideMenu";
import type { ILibraryData } from "@/types/library";

const setModeSpy = vi.fn();

vi.mock("@mui/material/styles", async () => {
  const actual =
    await vi.importActual<typeof import("@mui/material/styles")>("@mui/material/styles");

  return {
    ...actual,
    useColorScheme: () => ({ mode: "system" as const, setMode: setModeSpy }),
  };
});

const createMockLibrary = (overrides?: Partial<ILibraryData>): ILibraryData => {
  return {
    rootConfigured: true,
    rootPath: "/tmp/images",
    defaultStyle: "3d",
    styles: ["realistic", "3d", "anime"],
    images: [],
    characters: [],
    poses: [],
    warning: null,
    cacheAvailable: true,
    ...overrides,
  };
};

describe("SideMenu", () => {
  it("calls onMajorFilterChange when category buttons are clicked", () => {
    const library = createMockLibrary({ cacheAvailable: true });
    const mockOnFilterChange = vi.fn();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={mockOnFilterChange}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={vi.fn()}
        library={library}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Styles" }));
    fireEvent.click(screen.getByRole("button", { name: "Poses" }));
    fireEvent.click(screen.getByRole("button", { name: "Characters" }));

    expect(mockOnFilterChange).toHaveBeenNthCalledWith(1, "style");
    expect(mockOnFilterChange).toHaveBeenNthCalledWith(2, "pose");
    expect(mockOnFilterChange).toHaveBeenNthCalledWith(3, "character");
  });

  it("displays the 'Show new only' toggle when cache is available", () => {
    const library = createMockLibrary({ cacheAvailable: true });
    const mockOnFilterChange = vi.fn();
    const mockOnNewImagesChange = vi.fn();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={mockOnFilterChange}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={mockOnNewImagesChange}
        library={library}
      />,
    );

    expect(screen.getByLabelText("Show new only")).toBeInTheDocument();
  });

  it("hides the 'Show new only' toggle and shows cache unavailable message when cache is not available", () => {
    const library = createMockLibrary({ cacheAvailable: false });
    const mockOnFilterChange = vi.fn();
    const mockOnNewImagesChange = vi.fn();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={mockOnFilterChange}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={mockOnNewImagesChange}
        library={library}
      />,
    );

    expect(screen.queryByLabelText("Show new only")).not.toBeInTheDocument();
    expect(screen.getByText("Cache unavailable - refresh disabled")).toBeInTheDocument();
  });

  it("calls onShowOnlyNewImagesChange when switch is toggled", () => {
    const library = createMockLibrary({ cacheAvailable: true });
    const mockOnNewImagesChange = vi.fn();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={vi.fn()}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={mockOnNewImagesChange}
        library={library}
      />,
    );

    const switchInput = screen.getByRole("switch", { name: /Show new only/i });
    expect(switchInput).not.toBeChecked();

    fireEvent.click(switchInput);
    expect(mockOnNewImagesChange).toHaveBeenCalledWith(true);
  });

  it("calls setMode when a theme mode button is selected", () => {
    setModeSpy.mockClear();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={vi.fn()}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={vi.fn()}
        library={createMockLibrary({ cacheAvailable: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "use light theme" }));
    fireEvent.click(screen.getByRole("button", { name: "use dark theme" }));

    expect(setModeSpy).toHaveBeenNthCalledWith(1, "light");
    expect(setModeSpy).toHaveBeenNthCalledWith(2, "dark");
  });
});
