// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImageDetailMetadata } from "@/components/image-viewer/details/ImageDetailMetadata";

describe("ImageDetailMetadata", () => {
  it("splits prompt, negative prompt, and generation parameters on separate lines", () => {
    render(
      <ImageDetailMetadata
        pngMetadata={"a pretty character\nNegative prompt: blurry\nSteps: 30, Seed: 1"}
      />,
    );

    expect(screen.getByText("a pretty character")).toBeInTheDocument();
    expect(screen.getByText("blurry")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("keeps a quoted block with embedded commas as a single value", () => {
    const metadata =
      'Steps: 30\nNegative prompt: \nControlNet 0: "Module: None, Weight: 1, Guidance Start: 0.0"';

    render(<ImageDetailMetadata pngMetadata={metadata} />);

    expect(screen.getByText("Module: None, Weight: 1, Guidance Start: 0.0")).toBeInTheDocument();
  });

  it("does not crash when the metadata has only a single line", () => {
    expect(() => render(<ImageDetailMetadata pngMetadata="a pretty character" />)).not.toThrow();

    expect(screen.getByText("a pretty character")).toBeInTheDocument();
  });

  it("does not crash when the metadata is an empty string", () => {
    expect(() => render(<ImageDetailMetadata pngMetadata="" />)).not.toThrow();
  });
});
