// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IImageItem } from "@/types/library";

import { PoseConformityModal } from "./PoseConformityModal";

vi.mock("@/components/image-viewer/image/LazyImage", () => ({
  LazyImage: () => <div data-testid="lazy-image" />,
}));

const buildItem = (relativePath: string): IImageItem => ({
  id: relativePath,
  style: "3d",
  characterName: "Anna",
  poseName: "Casul",
  poseBaseName: "Casul",
  poseFilterName: "Casul",
  poseVariant: 1,
  relativePath,
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  mediaType: "image",
});

const listResponse = (items: IImageItem[]) =>
  new Response(JSON.stringify({ standardPoses: ["Casual", "Dancing"], items }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PoseConformityModal", () => {
  it("lists non-conforming files with a button per standard pose", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(listResponse([buildItem("characters/3d/Anna/Casul.png")])),
    );

    render(<PoseConformityModal open onClose={vi.fn()} />);

    expect(await screen.findByText("Casul.png")).toBeInTheDocument();
    expect(screen.getByText("1 file doesn't match a standard pose")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Casual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dancing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });

  it("renames to the picked pose and drops the card", async () => {
    const onChangesApplied = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        listResponse([
          buildItem("characters/3d/Anna/Casul.png"),
          buildItem("characters/3d/Anna/Odd.png"),
        ]),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ newPath: "x" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PoseConformityModal open onClose={vi.fn()} onChangesApplied={onChangesApplied} />);
    await screen.findByText("Casul.png");

    fireEvent.click(screen.getAllByRole("button", { name: "Casual" })[0]);

    await waitFor(() => {
      expect(screen.queryByText("Casul.png")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Odd.png")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/pose-conformity",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "characters/3d/Anna/Casul.png", pose: "Casual" }),
      }),
    );
    expect(onChangesApplied).toHaveBeenCalledTimes(1);
  });

  it("marks a file as custom", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listResponse([buildItem("characters/3d/Anna/Odd.png")]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PoseConformityModal open onClose={vi.fn()} />);
    await screen.findByText("Odd.png");

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(
      await screen.findByText("Every image and video matches a standard pose."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/pose-conformity",
      expect.objectContaining({
        body: JSON.stringify({ path: "characters/3d/Anna/Odd.png", custom: true }),
      }),
    );
  });

  it("keeps the card and shows the error when an update fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(listResponse([buildItem("characters/3d/Anna/Casul.png")]))
        .mockResolvedValueOnce(new Response("File not found", { status: 404 }))
        .mockRejectedValueOnce(new Error("offline")),
    );

    render(<PoseConformityModal open onClose={vi.fn()} />);
    await screen.findByText("Casul.png");

    fireEvent.click(screen.getByRole("button", { name: "Casual" }));
    expect(await screen.findByText("File not found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dancing" }));
    expect(await screen.findByText("Could not update this file. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Casul.png")).toBeInTheDocument();
  });

  it("shows an error when the list can't be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("nope", { status: 500 }))
        .mockRejectedValueOnce(new Error("offline")),
    );

    const { rerender } = render(<PoseConformityModal open onClose={vi.fn()} />);
    expect(
      await screen.findByText("Could not check the library's poses. Try again."),
    ).toBeInTheDocument();

    rerender(<PoseConformityModal open={false} onClose={vi.fn()} />);
    rerender(<PoseConformityModal open onClose={vi.fn()} />);
    expect(
      await screen.findByText("Could not check the library's poses. Try again."),
    ).toBeInTheDocument();
  });
});
