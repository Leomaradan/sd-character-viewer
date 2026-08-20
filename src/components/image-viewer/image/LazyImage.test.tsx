// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LazyImage } from "@/components/image-viewer/image/LazyImage";

vi.mock("@/components/image-viewer/image/LazyImagePreview", () => ({
  LazyImagePreview: ({ usePreview }: { usePreview?: boolean }) => (
    <div data-testid="preview" data-use-preview={String(Boolean(usePreview))} />
  ),
}));

vi.mock("@/components/image-viewer/image/LazyImageMagnifier", () => ({
  LazyImageMagnifier: () => <div data-testid="magnifier" />,
}));

const emptySx = {};

describe("LazyImage", () => {
  it("renders the magnifier when mode is 'magnifier'", () => {
    render(
      <LazyImage
        relativePath="characters/3d/Anna/Base.png"
        alt="Anna"
        sx={emptySx}
        mode="magnifier"
      />,
    );

    expect(screen.getByTestId("magnifier")).toBeInTheDocument();
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
  });

  it("renders the preview with the preview variant when mode is 'preview'", () => {
    render(
      <LazyImage
        relativePath="characters/3d/Anna/Base.png"
        alt="Anna"
        sx={emptySx}
        mode="preview"
      />,
    );

    expect(screen.getByTestId("preview")).toHaveAttribute("data-use-preview", "true");
  });

  it("renders the full-resolution preview by default", () => {
    render(<LazyImage relativePath="characters/3d/Anna/Base.png" alt="Anna" sx={emptySx} />);

    expect(screen.getByTestId("preview")).toHaveAttribute("data-use-preview", "false");
  });
});
