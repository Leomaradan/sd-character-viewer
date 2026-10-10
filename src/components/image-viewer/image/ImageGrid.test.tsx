// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IImageItem } from "@/types/library";

import { ImageGrid } from "./ImageGrid";

vi.mock("@/components/image-viewer/image/LazyImage", () => ({
  LazyImage: () => <div data-testid="lazy-image" />,
}));

const buildImage = (index: number): IImageItem => ({
  id: `img-${index}`,
  style: "3d",
  characterName: `Char${index}`,
  poseName: "Base",
  poseBaseName: "Base",
  poseFilterName: "Base",
  poseVariant: 1,
  relativePath: `characters/3d/Char${index}/Base.png`,
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  mediaType: "image",
});

const images = Array.from({ length: 130 }, (_, index) => buildImage(index));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImageGrid", () => {
  it("renders the first page and the rest on demand", () => {
    render(
      <ImageGrid
        images={images}
        resetKey="a"
        showNewBadge={false}
        styleLabel={String}
        onImageSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("lazy-image")).toHaveLength(120);

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(screen.getAllByTestId("lazy-image")).toHaveLength(130);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("loads the next page when the sentinel scrolls into view", () => {
    let trigger: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          trigger = callback;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      },
    );

    render(
      <ImageGrid
        images={images}
        resetKey="a"
        showNewBadge={false}
        styleLabel={String}
        onImageSelect={vi.fn()}
      />,
    );

    act(() => {
      trigger?.([{ isIntersecting: false }]);
    });
    expect(screen.getAllByTestId("lazy-image")).toHaveLength(120);

    act(() => {
      trigger?.([{ isIntersecting: true }]);
    });
    expect(screen.getAllByTestId("lazy-image")).toHaveLength(130);
    expect(disconnect).toHaveBeenCalled();
  });
});
