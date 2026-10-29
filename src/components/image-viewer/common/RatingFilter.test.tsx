// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RatingFilter } from "@/components/image-viewer/common/RatingFilter";

describe("RatingFilter", () => {
  it("checks the selected ratings", () => {
    render(<RatingFilter ratingFilter={["unrated", "good"]} onRatingFilterChange={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Unrated" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "OK" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Good" })).toBeChecked();
  });

  it("adds a checked rating, keeping the checkboxes' order", () => {
    const onRatingFilterChange = vi.fn();
    render(<RatingFilter ratingFilter={["good"]} onRatingFilterChange={onRatingFilterChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Unrated" }));

    expect(onRatingFilterChange).toHaveBeenCalledWith(["unrated", "good"]);
  });

  it("removes an unchecked rating", () => {
    const onRatingFilterChange = vi.fn();
    render(
      <RatingFilter ratingFilter={["ok", "good"]} onRatingFilterChange={onRatingFilterChange} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "OK" }));

    expect(onRatingFilterChange).toHaveBeenCalledWith(["good"]);
  });
});
