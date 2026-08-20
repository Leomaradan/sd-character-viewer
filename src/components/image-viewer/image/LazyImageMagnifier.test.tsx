// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyImageMagnifier } from "@/components/image-viewer/image/LazyImageMagnifier";

const emptySx = {};

vi.mock("easy-magnify", () => ({
  EasyZoomOnMove: ({
    mainImage,
    zoomImage,
  }: {
    mainImage: unknown;
    zoomImage: { src: string };
  }) => (
    <div data-testid="magnifier" data-main={JSON.stringify(mainImage)} data-zoom={zoomImage.src} />
  ),
}));

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 800;
  naturalHeight = 600;
  #src = "";

  get src() {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    FakeImage.instances.push(this);
  }

  static instances: FakeImage[] = [];
}

describe("LazyImageMagnifier", () => {
  let intersectionCallback: (entries: Array<{ isIntersecting: boolean }>) => void;

  beforeEach(() => {
    FakeImage.instances = [];

    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          intersectionCallback = callback;
        }
        observe() {}
        disconnect() {}
      },
    );

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    vi.stubGlobal("Image", FakeImage);

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 300,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not preload the full image until it intersects the viewport", () => {
    render(
      <LazyImageMagnifier relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />,
    );

    expect(FakeImage.instances).toHaveLength(0);
    expect(screen.queryByTestId("magnifier")).not.toBeInTheDocument();
  });

  it("renders the magnifier once the full image finishes loading", () => {
    render(
      <LazyImageMagnifier relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />,
    );

    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });

    expect(FakeImage.instances).toHaveLength(1);
    act(() => {
      FakeImage.instances[0].onload?.();
    });

    const magnifier = screen.getByTestId("magnifier");
    expect(magnifier).toHaveAttribute(
      "data-zoom",
      "/api/image?path=characters%2F3d%2FAnna%2FBase.png",
    );
  });

  it("falls back to a plain preview image when the full image fails to load", () => {
    render(
      <LazyImageMagnifier relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />,
    );

    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });
    act(() => {
      FakeImage.instances[0].onerror?.();
    });

    expect(screen.queryByTestId("magnifier")).not.toBeInTheDocument();
    expect(screen.getByAltText("Anna")).toHaveAttribute(
      "src",
      "/api/image?path=characters%2F3d%2FAnna%2FBase.png",
    );
  });
});
