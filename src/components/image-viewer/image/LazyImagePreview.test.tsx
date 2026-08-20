// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyImagePreview } from "@/components/image-viewer/image/LazyImagePreview";

const emptySx = {};

describe("LazyImagePreview", () => {
  let observeSpy: ReturnType<typeof vi.fn>;
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let intersectionCallback: (entries: Array<{ isIntersecting: boolean }>) => void;

  beforeEach(() => {
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          intersectionCallback = callback;
        }
        observe = observeSpy;
        disconnect = disconnectSpy;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render the image until it intersects the viewport", () => {
    render(<LazyImagePreview relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />);

    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText("Anna")).not.toBeInTheDocument();
  });

  it("renders the full-resolution image once it intersects the viewport", () => {
    render(<LazyImagePreview relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />);

    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });

    const image = screen.getByAltText("Anna");
    expect(image).toHaveAttribute("src", "/api/image?path=characters%2F3d%2FAnna%2FBase.png");
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it("requests the preview variant when usePreview is set", () => {
    render(
      <LazyImagePreview
        relativePath="characters/3d/Anna/Base.png"
        alt="Anna"
        sx={emptySx}
        usePreview
      />,
    );

    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });

    expect(screen.getByAltText("Anna")).toHaveAttribute(
      "src",
      "/api/image?path=characters%2F3d%2FAnna%2FBase.png&variant=preview",
    );
  });

  it("ignores non-intersecting entries", () => {
    render(<LazyImagePreview relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />);

    act(() => {
      intersectionCallback([{ isIntersecting: false }]);
    });

    expect(screen.queryByAltText("Anna")).not.toBeInTheDocument();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });
});
