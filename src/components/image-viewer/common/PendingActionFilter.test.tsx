// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PendingActionFilter } from "@/components/image-viewer/common/PendingActionFilter";

describe("PendingActionFilter", () => {
  it("toggles the filter on and off", () => {
    const onWithActionChange = vi.fn();
    const { rerender } = render(
      <PendingActionFilter withAction={false} onWithActionChange={onWithActionChange} />,
    );

    const button = screen.getByRole("button", { name: "With action" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onWithActionChange).toHaveBeenLastCalledWith(true);

    rerender(<PendingActionFilter withAction onWithActionChange={onWithActionChange} />);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onWithActionChange).toHaveBeenLastCalledWith(false);
  });
});
