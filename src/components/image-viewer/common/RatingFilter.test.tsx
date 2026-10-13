// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RatingFilter } from "@/components/image-viewer/common/RatingFilter";

describe("RatingFilter", () => {
  it("marks the currently selected option as pressed", () => {
    render(<RatingFilter ratingFilter="good" onRatingFilterChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onRatingFilterChange with the newly selected value", () => {
    const onRatingFilterChange = vi.fn();
    render(<RatingFilter ratingFilter="all" onRatingFilterChange={onRatingFilterChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Unrated" }));

    expect(onRatingFilterChange).toHaveBeenCalledWith("unrated");
  });

  it("does not call onRatingFilterChange when clicking the already-selected option", () => {
    const onRatingFilterChange = vi.fn();
    render(<RatingFilter ratingFilter="all" onRatingFilterChange={onRatingFilterChange} />);

    fireEvent.click(screen.getByRole("button", { name: "All" }));

    expect(onRatingFilterChange).not.toHaveBeenCalled();
  });
});
