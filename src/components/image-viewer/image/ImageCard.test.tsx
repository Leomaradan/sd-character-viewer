// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IImageItem } from "@/types/library";

import { ImageCard } from "@/components/image-viewer/image/ImageCard";

vi.mock("@/components/image-viewer/image/LazyImage", () => ({
  LazyImage: () => <div data-testid="lazy-image" />,
}));

const upperCaseStyleLabel = (style: string) => style.toUpperCase();

const createImage = (overrides?: Partial<IImageItem>): IImageItem => ({
  id: "img-1",
  style: "realistic",
  characterName: "Anna",
  poseName: "Sitting",
  poseBaseName: "sitting",
  poseVariant: 0,
  relativePath: "characters/realistic/Anna/Sitting.png",
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  mediaType: "image",
  ...overrides,
});

describe("ImageCard", () => {
  it("renders the character name and formatted style/pose", () => {
    render(<ImageCard image={createImage()} styleLabel={upperCaseStyleLabel} />);

    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("REALISTIC - Sitting")).toBeInTheDocument();
  });

  it("uses the default style label formatter when none is provided", () => {
    render(<ImageCard image={createImage({ style: "realistic" })} />);

    expect(screen.getByText(/Sitting/)).toBeInTheDocument();
  });

  it("calls onSelect with the image when clicked", () => {
    const onSelect = vi.fn();
    const image = createImage();

    render(<ImageCard image={image} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(image);
  });

  it("does not throw when clicked without an onSelect handler", () => {
    render(<ImageCard image={createImage()} />);

    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
  });

  it("shows the new badge when showNewBadge is true and the image is new", () => {
    render(<ImageCard image={createImage({ isNew: true })} showNewBadge />);

    expect(screen.getByLabelText("New image")).toBeInTheDocument();
  });

  it("hides the new badge when the image is not new", () => {
    render(<ImageCard image={createImage({ isNew: false })} showNewBadge />);

    expect(screen.queryByLabelText("New image")).not.toBeInTheDocument();
  });

  it("hides the new badge when showNewBadge is false even if the image is new", () => {
    render(<ImageCard image={createImage({ isNew: true })} showNewBadge={false} />);

    expect(screen.queryByLabelText("New image")).not.toBeInTheDocument();
  });
});
