import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SideMenu } from "@/components/image-viewer/SideMenu";
import type { ILibraryData } from "@/types/library";

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

  it("toggles the switch when clicked and cache is available", async () => {
    const library = createMockLibrary({ cacheAvailable: true });
    const mockOnFilterChange = vi.fn();
    const mockOnNewImagesChange = vi.fn();

    const { getByRole } = render(
      <SideMenu
        majorFilter="character"
        onMajorFilterChange={mockOnFilterChange}
        showOnlyNewImages={false}
        onShowOnlyNewImagesChange={mockOnNewImagesChange}
        library={library}
      />,
    );

    const switchInput = getByRole("checkbox", { name: /Show new only/i });
    expect(switchInput).not.toBeChecked();
  });
});
