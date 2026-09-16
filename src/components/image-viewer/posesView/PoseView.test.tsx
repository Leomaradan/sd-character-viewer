// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PoseView } from "@/components/image-viewer/posesView/PoseView";

const STANDING_OPTION = { value: "standing", label: "Standing" };

describe("PoseView", () => {
  it("renders a string pose option and toggles it by its raw value", () => {
    const onTogglePose = vi.fn();

    render(<PoseView poseOption="sitting" primary={false} onTogglePose={onTogglePose} />);

    const chip = screen.getByText("sitting");
    expect(chip).toBeInTheDocument();

    fireEvent.click(chip);
    expect(onTogglePose).toHaveBeenCalledWith("sitting");
  });

  it("renders an object pose option using its label and toggles by its value", () => {
    const onTogglePose = vi.fn();

    render(<PoseView poseOption={STANDING_OPTION} primary={false} onTogglePose={onTogglePose} />);

    const chip = screen.getByText("Standing");
    expect(chip).toBeInTheDocument();

    fireEvent.click(chip);
    expect(onTogglePose).toHaveBeenCalledWith("standing");
  });

  it("uses the primary color when selected", () => {
    render(<PoseView poseOption={STANDING_OPTION} primary onTogglePose={vi.fn()} />);

    expect(screen.getByText("Standing").closest(".MuiChip-colorPrimary")).not.toBeNull();
  });
});
