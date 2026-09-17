// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PosesView } from "@/components/image-viewer/posesView/PosesView";

const FEW_POSE_OPTIONS = [
  { value: "sitting", label: "Sitting" },
  { value: "standing", label: "Standing" },
];

const MANY_POSE_OPTIONS = Array.from({ length: 11 }, (_, index) => ({
  value: `pose-${index}`,
  label: `Pose ${index}`,
}));

const createProps = (overrides?: Partial<React.ComponentProps<typeof PosesView>>) => ({
  styles: ["realistic", "anime"],
  styleLabel: (style: string) => style,
  poseViewPoseOptions: FEW_POSE_OPTIONS,
  poseViewSelectedPoses: [],
  poseViewStyle: "--all--",
  poseViewCharacterSearch: "",
  metadataFilterOptions: [],
  selectedMetadataFilterId: "",
  poseFilteredImages: [],
  showNewBadge: false,
  mediaTypeFilter: "both" as const,
  onMediaTypeFilterChange: vi.fn(),
  onClearPoses: vi.fn(),
  onTogglePose: vi.fn(),
  onPoseStyleChange: vi.fn(),
  onMetadataFilterChange: vi.fn(),
  onClearMetadataFilter: vi.fn(),
  onCharacterSearchChange: vi.fn(),
  onImageSelect: vi.fn(),
  ...overrides,
});

describe("PosesView", () => {
  it("renders individual pose chips when there are few pose options", () => {
    const props = createProps();

    render(<PosesView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Sitting" }));
    expect(props.onTogglePose).toHaveBeenCalledWith("sitting");

    fireEvent.click(screen.getByRole("button", { name: "All poses" }));
    expect(props.onClearPoses).toHaveBeenCalled();
  });

  it("renders a TagPicker instead of chips once there are many pose options", () => {
    const props = createProps({ poseViewPoseOptions: MANY_POSE_OPTIONS });

    render(<PosesView {...props} />);

    expect(screen.queryByRole("button", { name: "Pose 0" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("toggles a pose on when it is picked from the TagPicker select", () => {
    const props = createProps({
      poseViewPoseOptions: MANY_POSE_OPTIONS,
      poseViewSelectedPoses: ["pose-0"],
    });

    render(<PosesView {...props} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Pose 1" }));

    expect(props.onTogglePose).toHaveBeenCalledWith("pose-1");
  });

  it("toggles a pose off when its chip is deleted in the TagPicker", () => {
    const props = createProps({
      poseViewPoseOptions: MANY_POSE_OPTIONS,
      poseViewSelectedPoses: ["pose-0", "pose-1"],
    });

    render(<PosesView {...props} />);

    const chip = screen.getByText("Pose 0").closest(".MuiChip-root");
    const deleteIcon = chip?.querySelector(".MuiChip-deleteIcon");

    expect(deleteIcon).not.toBeNull();
    fireEvent.click(deleteIcon as Element);

    expect(props.onTogglePose).toHaveBeenCalledWith("pose-0");
  });

  it("clears all poses when 'Clear all' is clicked in the TagPicker", () => {
    const props = createProps({
      poseViewPoseOptions: MANY_POSE_OPTIONS,
      poseViewSelectedPoses: ["pose-0", "pose-1"],
    });

    render(<PosesView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(props.onClearPoses).toHaveBeenCalled();
  });

  it("selects a style and clears the style filter", () => {
    const props = createProps({ poseViewStyle: "realistic" });

    render(<PosesView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "anime" }));
    expect(props.onPoseStyleChange).toHaveBeenCalledWith("anime");

    fireEvent.click(screen.getByRole("button", { name: "All styles" }));
    expect(props.onPoseStyleChange).toHaveBeenCalledWith("--all--");
  });

  it("reports character search text changes", () => {
    const props = createProps();

    render(<PosesView {...props} />);

    fireEvent.change(screen.getByLabelText("Character contains"), {
      target: { value: "Alice" },
    });

    expect(props.onCharacterSearchChange).toHaveBeenCalledWith("Alice");
  });

  it("shows a clear button for the character search once text is entered", () => {
    const props = createProps({ poseViewCharacterSearch: "Alice" });

    render(<PosesView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear character search" }));
    expect(props.onCharacterSearchChange).toHaveBeenCalledWith("");
  });

  it("reports media type filter changes", () => {
    const props = createProps({ mediaTypeFilter: "both" });

    render(<PosesView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Videos" }));
    expect(props.onMediaTypeFilterChange).toHaveBeenCalledWith("video");
  });
});
