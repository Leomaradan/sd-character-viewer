// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UpscaledFilter } from "@/components/image-viewer/common/UpscaledFilter";

describe("UpscaledFilter", () => {
  it("reflects the current state as pressed or not", () => {
    const { rerender } = render(
      <UpscaledFilter showOnlyUpscaled onShowOnlyUpscaledChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Show only upscaled files" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(<UpscaledFilter showOnlyUpscaled={false} onShowOnlyUpscaledChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show only upscaled files" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles the state on click", () => {
    const onShowOnlyUpscaledChange = vi.fn();
    const { rerender } = render(
      <UpscaledFilter
        showOnlyUpscaled={false}
        onShowOnlyUpscaledChange={onShowOnlyUpscaledChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show only upscaled files" }));
    expect(onShowOnlyUpscaledChange).toHaveBeenLastCalledWith(true);

    rerender(
      <UpscaledFilter showOnlyUpscaled onShowOnlyUpscaledChange={onShowOnlyUpscaledChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show only upscaled files" }));
    expect(onShowOnlyUpscaledChange).toHaveBeenLastCalledWith(false);
  });
});
