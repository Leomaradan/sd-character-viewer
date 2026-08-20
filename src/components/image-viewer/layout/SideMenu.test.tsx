// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ILibraryData } from "@/types/library";

import { SideMenu } from "@/components/image-viewer/layout/SideMenu";

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
    posePatternFilters: [],
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

  it("calls onCharacterSortOrderChange when a sort option is selected", () => {
    const mockOnSortOrderChange = vi.fn();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={vi.fn()}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={vi.fn()}
        characterSortOrder="name"
        onCharacterSortOrderChange={mockOnSortOrderChange}
        library={createMockLibrary({ cacheAvailable: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "sort by date" }));
    expect(mockOnSortOrderChange).toHaveBeenCalledWith("date");
  });

  it("ignores deselecting the currently active sort option", () => {
    const mockOnSortOrderChange = vi.fn();

    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={vi.fn()}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={vi.fn()}
        characterSortOrder="name"
        onCharacterSortOrderChange={mockOnSortOrderChange}
        library={createMockLibrary({ cacheAvailable: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "sort by name" }));
    expect(mockOnSortOrderChange).not.toHaveBeenCalled();
  });

  it("shows the app version below the theme switcher when provided", () => {
    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={vi.fn()}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={vi.fn()}
        library={createMockLibrary({ cacheAvailable: true })}
        appVersion="1.3.1"
      />,
    );

    expect(screen.getByText("v1.3.1")).toBeInTheDocument();
  });

  it("does not render a version when appVersion is not provided", () => {
    render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={vi.fn()}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={vi.fn()}
        library={createMockLibrary({ cacheAvailable: true })}
      />,
    );

    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
  });
});
