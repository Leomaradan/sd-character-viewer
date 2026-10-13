// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageDetailActions } from "./ImageDetailActions";

type TProps = ComponentProps<typeof ImageDetailActions>;

const createProps = (overrides: Partial<TProps> = {}): TProps => ({
  deleteError: null,
  redrawError: null,
  upscaleError: null,
  animateError: null,
  upscaleVideoError: null,
  extendError: null,
  isVideo: false,
  hasAnimations: false,
  isRedrawing: false,
  onRedraw: vi.fn(),
  rating: null,
  isRating: false,
  ratingError: null,
  onRate: vi.fn(),
  isTogglingUpscale: false,
  isUpscaleMarked: false,
  onToggleUpscale: vi.fn(),
  isTogglingAnimate: false,
  animateAction: null,
  animateActionLabel: "Animate",
  onOpenAnimateMenu: vi.fn(),
  isTogglingUpscaleVideo: false,
  isUpscaleVideoMarked: false,
  onToggleUpscaleVideo: vi.fn(),
  isTogglingExtend: false,
  extendAction: null,
  extendActionLabel: "Extend",
  onOpenExtendMenu: vi.fn(),
  canEditAnimationPrompt: false,
  onOpenEditPrompt: vi.fn(),
  isDeleting: false,
  deleteLabel: "Delete",
  onDelete: vi.fn(),
  ...overrides,
});

describe("ImageDetailActions rating", () => {
  it("runs Redraw for Bad and rates OK/Good", () => {
    const props = createProps();
    render(<ImageDetailActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Bad" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    fireEvent.click(screen.getByRole("button", { name: "Good" }));

    expect(props.onRedraw).toHaveBeenCalledTimes(1);
    expect(props.onRate).toHaveBeenNthCalledWith(1, "ok");
    expect(props.onRate).toHaveBeenNthCalledWith(2, "good");
  });

  it("highlights the current rating", () => {
    render(<ImageDetailActions {...createProps({ rating: "good" })} />);

    expect(screen.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "OK" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables the rating buttons while a rating is saved and shows its error", () => {
    render(
      <ImageDetailActions
        {...createProps({ isRating: true, ratingError: "Could not save the rating." })}
      />,
    );

    expect(screen.getByRole("button", { name: "Bad" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Good" })).toBeDisabled();
    expect(screen.getByText("Could not save the rating.")).toBeInTheDocument();
  });
});

describe("ImageDetailActions", () => {
  it("shows every error", () => {
    render(
      <ImageDetailActions
        {...createProps({
          deleteError: "delete failed",
          redrawError: "redraw failed",
          upscaleError: "upscale failed",
          animateError: "animate failed",
          upscaleVideoError: "upscale video failed",
          extendError: "extend failed",
        })}
      />,
    );

    for (const message of [
      "delete failed",
      "redraw failed",
      "upscale failed",
      "animate failed",
      "upscale video failed",
      "extend failed",
    ]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
  });

  it("offers Upscale and Animate for an image", () => {
    const props = createProps({
      hasAnimations: true,
      isUpscaleMarked: true,
      animateAction: "dance",
      animateActionLabel: "Dance",
      canEditAnimationPrompt: true,
    });
    render(<ImageDetailActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Upscale" }));
    fireEvent.click(screen.getByRole("button", { name: "Dance" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Animation" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(props.onToggleUpscale).toHaveBeenCalled();
    expect(props.onOpenAnimateMenu).toHaveBeenCalled();
    expect(props.onOpenEditPrompt).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Extend" })).not.toBeInTheDocument();
  });

  it("offers Upscale and Extend for a video", () => {
    const props = createProps({
      isVideo: true,
      hasAnimations: true,
      isUpscaleVideoMarked: true,
      extendAction: "spin",
      extendActionLabel: "Spin",
    });
    render(<ImageDetailActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Upscale" }));
    fireEvent.click(screen.getByRole("button", { name: "Spin" }));

    expect(props.onToggleUpscaleVideo).toHaveBeenCalled();
    expect(props.onOpenExtendMenu).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Animate" })).not.toBeInTheDocument();
  });

  it("shows spinners while actions run", () => {
    render(
      <ImageDetailActions
        {...createProps({
          hasAnimations: true,
          isRedrawing: true,
          isTogglingUpscale: true,
          isTogglingAnimate: true,
          isDeleting: true,
        })}
      />,
    );

    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
  });

  it("shows spinners while video actions run", () => {
    render(
      <ImageDetailActions
        {...createProps({
          isVideo: true,
          hasAnimations: true,
          isTogglingUpscaleVideo: true,
          isTogglingExtend: true,
        })}
      />,
    );

    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });
});
