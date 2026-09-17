// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaTypeFilter } from "@/components/image-viewer/common/MediaTypeFilter";

describe("MediaTypeFilter", () => {
  it("marks the currently selected option as pressed", () => {
    render(<MediaTypeFilter mediaTypeFilter="video" onMediaTypeFilterChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Videos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Images" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onMediaTypeFilterChange with the newly selected value", () => {
    const onMediaTypeFilterChange = vi.fn();
    render(
      <MediaTypeFilter mediaTypeFilter="both" onMediaTypeFilterChange={onMediaTypeFilterChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Images" }));

    expect(onMediaTypeFilterChange).toHaveBeenCalledWith("image");
  });

  it("does not call onMediaTypeFilterChange when clicking the already-selected option", () => {
    const onMediaTypeFilterChange = vi.fn();
    render(
      <MediaTypeFilter mediaTypeFilter="both" onMediaTypeFilterChange={onMediaTypeFilterChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Both" }));

    expect(onMediaTypeFilterChange).not.toHaveBeenCalled();
  });
});
