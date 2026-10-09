// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageDetailRenameDialog } from "@/components/image-viewer/details/ImageDetailRenameDialog";

const renderDialog = (overrides: Partial<Parameters<typeof ImageDetailRenameDialog>[0]> = {}) => {
  const props = {
    open: true,
    isVideo: false,
    relativePath: "characters/3d/Anna/Casul.png",
    onClose: vi.fn(),
    onRenamed: vi.fn(),
    ...overrides,
  };
  render(<ImageDetailRenameDialog {...props} />);
  return props;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ImageDetailRenameDialog", () => {
  it("prefills the current name without its extension", () => {
    renderDialog();

    expect(screen.getByLabelText("Name")).toHaveValue("Casul");
    expect(screen.getByText(".png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
  });

  it("sends the new name and reports the new path", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ newPath: "characters/3d/Anna/Casual.png" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const props = renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Casual" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(props.onRenamed).toHaveBeenCalledWith("characters/3d/Anna/Casual.png");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/image?path=characters%2F3d%2FAnna%2FCasul.png",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ newName: "Casual" }) }),
    );
  });

  it("shows the server's error when the name is already taken", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('A file named "Base.png" already exists.', { status: 409 }),
        ),
    );
    const props = renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(await screen.findByText('A file named "Base.png" already exists.')).toBeInTheDocument();
    expect(props.onRenamed).not.toHaveBeenCalled();
  });

  it("rejects an empty name without calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderDialog();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(await screen.findByText("The name can't be empty.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a generic error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderDialog({ isVideo: true, relativePath: "characters/3d/Anna/Dance.mp4" });

    expect(screen.getByText("Rename video")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dancing" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(await screen.findByText("Could not rename the file. Try again.")).toBeInTheDocument();
  });

  it("closes on Cancel", () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
