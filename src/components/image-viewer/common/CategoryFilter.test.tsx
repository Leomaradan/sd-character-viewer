// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryFilter } from "@/components/image-viewer/common/CategoryFilter";

const OPTIONS = [
  { id: "cat-1", type: "category" as const, value: "outfit", label: "Outfit" },
  { id: "tag-1", type: "tag" as const, value: "cute", label: "Cute" },
];

describe("CategoryFilter", () => {
  it("renders nothing when there are no filter options", () => {
    const { container } = render(
      <CategoryFilter
        metadataFilterOptions={[]}
        selectedMetadataFilterId=""
        onMetadataFilterChange={vi.fn()}
        onClearMetadataFilter={vi.fn()}
        prefix="pose"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the filter dropdown and its options when options are provided", () => {
    render(
      <CategoryFilter
        metadataFilterOptions={OPTIONS}
        selectedMetadataFilterId="cat-1"
        onMetadataFilterChange={vi.fn()}
        onClearMetadataFilter={vi.fn()}
        prefix="pose"
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Outfit" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cute" })).toBeInTheDocument();
  });

  it("calls onClearMetadataFilter when the clear button is enabled and clicked", () => {
    const onClearMetadataFilter = vi.fn();

    render(
      <CategoryFilter
        metadataFilterOptions={OPTIONS}
        selectedMetadataFilterId="cat-1"
        onMetadataFilterChange={vi.fn()}
        onClearMetadataFilter={onClearMetadataFilter}
        prefix="pose"
      />,
    );

    const clearButton = screen.getByLabelText("Clear metadata filter");
    expect(clearButton).toBeEnabled();

    fireEvent.click(clearButton);
    expect(onClearMetadataFilter).toHaveBeenCalled();
  });

  it("disables the clear button when no filter is selected", () => {
    render(
      <CategoryFilter
        metadataFilterOptions={OPTIONS}
        selectedMetadataFilterId=""
        onMetadataFilterChange={vi.fn()}
        onClearMetadataFilter={vi.fn()}
        prefix="pose"
      />,
    );

    expect(screen.getByLabelText("Clear metadata filter")).toBeDisabled();
  });
});
