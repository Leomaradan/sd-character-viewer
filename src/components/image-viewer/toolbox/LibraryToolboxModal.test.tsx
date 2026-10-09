// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LibraryToolboxModal } from "@/components/image-viewer/toolbox/LibraryToolboxModal";

const buildTools = () => [
  {
    id: "duplicate-finder",
    name: "Duplicate Finder",
    description: "Find duplicates",
    icon: <span>icon</span>,
    onOpen: vi.fn(),
  },
  {
    id: "other",
    name: "Other Tool",
    description: "Does other things",
    icon: <span>icon</span>,
    onOpen: vi.fn(),
  },
];

describe("LibraryToolboxModal", () => {
  it("lists every tool with its description", () => {
    render(<LibraryToolboxModal open onClose={vi.fn()} tools={buildTools()} />);

    expect(screen.getByText("Library Toolbox")).toBeInTheDocument();
    expect(screen.getByText("Duplicate Finder")).toBeInTheDocument();
    expect(screen.getByText("Find duplicates")).toBeInTheDocument();
    expect(screen.getByText("Other Tool")).toBeInTheDocument();
  });

  it("closes the toolbox and opens the picked tool", () => {
    const onClose = vi.fn();
    const tools = buildTools();
    render(<LibraryToolboxModal open onClose={onClose} tools={tools} />);

    fireEvent.click(screen.getByText("Duplicate Finder"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tools[0].onOpen).toHaveBeenCalledTimes(1);
    expect(tools[1].onOpen).not.toHaveBeenCalled();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    render(<LibraryToolboxModal open onClose={onClose} tools={buildTools()} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
