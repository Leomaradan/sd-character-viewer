// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagPicker } from "@/components/image-viewer/common/TagPicker";

const OPTIONS = [
  { value: "sitting", label: "Sitting" },
  { value: "standing", label: "Standing" },
  { value: "running", label: "Running" },
];

describe("TagPicker", () => {
  it("renders a chip for each selected value", () => {
    render(<TagPicker options={OPTIONS} value={["sitting", "standing"]} onChange={vi.fn()} />);

    expect(screen.getByText("Sitting")).toBeInTheDocument();
    expect(screen.getByText("Standing")).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("does not render chips or the clear button when nothing is selected", () => {
    render(<TagPicker options={OPTIONS} value={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("calls onChange with the tag added when a new option is picked", () => {
    const handleChange = vi.fn();

    render(<TagPicker options={OPTIONS} value={["sitting"]} onChange={handleChange} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Standing" }));

    expect(handleChange).toHaveBeenCalledWith(["sitting", "standing"]);
  });

  it("only offers options that are not already selected", () => {
    render(<TagPicker options={OPTIONS} value={["sitting"]} onChange={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));

    expect(screen.queryByRole("option", { name: "Sitting" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Standing" })).toBeInTheDocument();
  });

  it("calls onChange with the tag removed when a chip is deleted", () => {
    const handleChange = vi.fn();

    render(<TagPicker options={OPTIONS} value={["sitting", "standing"]} onChange={handleChange} />);

    const chip = screen.getByText("Sitting").closest(".MuiChip-root");
    const deleteIcon = chip?.querySelector(".MuiChip-deleteIcon");

    expect(deleteIcon).not.toBeNull();
    fireEvent.click(deleteIcon as Element);

    expect(handleChange).toHaveBeenCalledWith(["standing"]);
  });

  it("makes the select read-only once every option is selected", () => {
    render(
      <TagPicker options={OPTIONS} value={["sitting", "standing", "running"]} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("combobox")).toHaveAttribute("aria-readonly", "true");
    expect(screen.getByRole("combobox").closest(".MuiFormControl-root")).toHaveStyle({
      opacity: "0.5",
    });
  });

  it("falls back to the raw value as a chip label when it has no matching option", () => {
    render(<TagPicker options={OPTIONS} value={["sitting", "crouching"]} onChange={vi.fn()} />);

    expect(screen.getByText("crouching")).toBeInTheDocument();
  });

  it("calls onChange with an empty array when 'Clear all' is clicked", () => {
    const handleChange = vi.fn();

    render(<TagPicker options={OPTIONS} value={["sitting", "standing"]} onChange={handleChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(handleChange).toHaveBeenCalledWith([]);
  });
});
