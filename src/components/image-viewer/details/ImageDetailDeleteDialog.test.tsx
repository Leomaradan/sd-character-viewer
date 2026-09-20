// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageDetailDeleteDialog } from "@/components/image-viewer/details/ImageDetailDeleteDialog";

describe("ImageDetailDeleteDialog", () => {
  it("closes on Escape when not deleting", () => {
    const onClose = vi.fn();

    render(
      <ImageDetailDeleteDialog
        open
        isVideo={false}
        fileName="Base.png"
        characterName="Anna"
        isDeleting={false}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape while a delete is in flight, so the dialog stays open", () => {
    const onClose = vi.fn();

    render(
      <ImageDetailDeleteDialog
        open
        isVideo={false}
        fileName="Base.png"
        characterName="Anna"
        isDeleting
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });
});
