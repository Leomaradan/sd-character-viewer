// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LazyVideoPreview } from "@/components/image-viewer/image/LazyVideoPreview";

const emptySx = {};

describe("LazyVideoPreview", () => {
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

  it("does not render anything until it intersects the viewport", () => {
    render(
      <LazyVideoPreview relativePath="characters/3d/Anna/Dance.mp4" alt="Anna" sx={emptySx} />,
    );

    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText("Anna")).not.toBeInTheDocument();
  });

  it("optimistically requests the preview sidecar as an <img> once visible", () => {
    render(
      <LazyVideoPreview relativePath="characters/3d/Anna/Dance.mp4" alt="Anna" sx={emptySx} />,
    );

    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });

    const image = screen.getByAltText("Anna");
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute(
      "src",
      "/api/image?path=characters%2F3d%2FAnna%2FDance.mp4&variant=preview",
    );
  });

  it("falls back to a native, non-autoplaying <video> when the preview sidecar 404s", () => {
    const { container } = render(
      <LazyVideoPreview relativePath="characters/3d/Anna/Dance.mp4" alt="Anna" sx={emptySx} />,
    );

    act(() => {
      intersectionCallback([{ isIntersecting: true }]);
    });

    fireEvent.error(screen.getByAltText("Anna"));

    expect(screen.queryByAltText("Anna")).not.toBeInTheDocument();
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/api/image?path=characters%2F3d%2FAnna%2FDance.mp4");
    // React sets the "muted" IDL property directly rather than reflecting a content attribute
    // (see facebook/react#10389), so assert the property, not toHaveAttribute("muted").
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video).not.toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
  });
});
