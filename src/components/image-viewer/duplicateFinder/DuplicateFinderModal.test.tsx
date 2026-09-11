// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IDuplicateGroup, IImageItem } from "@/types/library";

import { DuplicateFinderModal } from "./DuplicateFinderModal";

const buildImage = (
  overrides: Partial<IImageItem> & Pick<IImageItem, "relativePath" | "characterName">,
): IImageItem => ({
  id: overrides.relativePath,
  style: "3d",
  poseName: "Base",
  poseBaseName: "Base",
  poseVariant: 1,
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  ...overrides,
});

const buildGroup = (id: string, characterName: string, style = "3d"): IDuplicateGroup => ({
  id,
  style,
  characterName,
  poseBaseName: "Base",
  images: [
    buildImage({ relativePath: `characters/${style}/${characterName}/Base.png`, characterName }),
    buildImage({
      relativePath: `characters/${style}/${characterName}/Base 2.png`,
      characterName,
      poseVariant: 2,
    }),
  ],
});

interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const createDeferred = <T,>(): IDeferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("DuplicateFinderModal", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        private readonly callback: IntersectionObserverCallback;

        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback;
        }

        observe(element: Element) {
          this.callback(
            [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores a stale response from a load started before the dialog was closed and reopened", async () => {
    const firstLoad = createDeferred<Response>();
    const secondLoad = createDeferred<Response>();
    fetchMock.mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(secondLoad.promise);

    const { rerender } = render(<DuplicateFinderModal open onClose={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Close and reopen before the first request resolves - this starts a second request.
    rerender(<DuplicateFinderModal open={false} onClose={vi.fn()} />);
    rerender(<DuplicateFinderModal open onClose={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // The second (newer) request resolves first.
    secondLoad.resolve({
      ok: true,
      json: () => Promise.resolve({ groups: [buildGroup("group-b", "Bob")] }),
    } as Response);

    await screen.findByText(/Bob - Base/);

    // The first (now-stale) request resolves after - it must not overwrite the fresher state.
    firstLoad.resolve({
      ok: true,
      json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
    } as Response);

    // Give the stale response a chance to be (incorrectly) applied if the fix regresses.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText(/Bob - Base/)).toBeInTheDocument();
    expect(screen.queryByText(/Anna - Base/)).not.toBeInTheDocument();
  });

  it("ignores a stale response that resolves its fetch before being closed and reopened, but parses its JSON after", async () => {
    const firstResponseJson = createDeferred<{ groups: IDuplicateGroup[] }>();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => firstResponseJson.promise })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-b", "Bob")] }),
      });

    const { rerender } = render(<DuplicateFinderModal open onClose={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The first request's fetch() has already resolved (only response.json() is still pending)
    // when the dialog is closed and reopened, starting a second request.
    rerender(<DuplicateFinderModal open={false} onClose={vi.fn()} />);
    rerender(<DuplicateFinderModal open onClose={vi.fn()} />);

    await screen.findByText(/Bob - Base/);

    // The first request's JSON now resolves - it must still be ignored.
    firstResponseJson.resolve({ groups: [buildGroup("group-a", "Anna")] });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(screen.getByText(/Bob - Base/)).toBeInTheDocument();
    expect(screen.queryByText(/Anna - Base/)).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no duplicate groups", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ groups: [] }) });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);

    expect(await screen.findByText("No duplicates to review.")).toBeInTheDocument();
  });

  it("shows an error message when the initial load response is not ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);

    expect(
      await screen.findByText("Could not load duplicate groups. Try again."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the initial load throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    render(<DuplicateFinderModal open onClose={vi.fn()} />);

    expect(
      await screen.findByText("Could not load duplicate groups. Try again."),
    ).toBeInTheDocument();
  });

  it("renders a divider between groups but not after the last one", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ groups: [buildGroup("group-a", "Anna"), buildGroup("group-b", "Bob")] }),
    });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);

    await screen.findByText(/Bob - Base/);
    expect(screen.getByText(/Anna - Base/)).toBeInTheDocument();
    // MUI Dialog content is portalled to document.body, so query there rather than `container`.
    expect(document.body.querySelectorAll(".MuiDivider-root")).toHaveLength(1);
  });

  it("uses orientation-aware rows and preserves image aspect ratios", async () => {
    const group = buildGroup("group-a", "Anna");
    group.images.push(
      buildImage({
        relativePath: "characters/3d/Anna/Base 3.png",
        characterName: "Anna",
        poseVariant: 3,
      }),
      buildImage({
        relativePath: "characters/3d/Anna/Base 4.png",
        characterName: "Anna",
        poseVariant: 4,
      }),
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: [group] }),
    });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);

    const images = await screen.findAllByRole("img");
    const imageGrid = screen.getByTestId("duplicate-images-group-a");
    expect(imageGrid.style.getPropertyValue("--duplicate-columns")).toBe("4");
    expect(images[0]).toHaveStyle({ height: "auto", objectFit: "contain" });

    Object.defineProperties(images[0], {
      naturalWidth: { value: 1200, configurable: true },
      naturalHeight: { value: 800, configurable: true },
    });
    fireEvent.load(images[0]);

    expect(imageGrid.style.getPropertyValue("--duplicate-columns")).toBe("3");
  });

  it("filters visible groups by style", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          groups: [buildGroup("group-a", "Anna", "3d"), buildGroup("group-b", "Bob", "anime")],
        }),
    });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);

    await screen.findByText(/Anna - Base/);
    expect(screen.getByText(/Bob - Base/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText("Style"));
    fireEvent.click(await screen.findByRole("option", { name: "Anime" }));

    expect(screen.queryByText(/Anna - Base/)).not.toBeInTheDocument();
    expect(screen.getByText(/Bob - Base/)).toBeInTheDocument();
  });

  it("lets the user change the primary image and toggle which images are kept", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
    });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    const primaryRadios = screen.getAllByRole("radio", { name: "Primary" });
    const keepCheckboxes = screen.getAllByRole("checkbox", { name: "Keep" });

    // Base.png is primary by default; Base 2.png is a plain kept image.
    expect(primaryRadios[0]).toBeChecked();
    expect(keepCheckboxes[1]).toBeChecked();

    // Switch the primary to Base 2.png.
    fireEvent.click(primaryRadios[1]);
    expect(primaryRadios[1]).toBeChecked();
    expect(primaryRadios[0]).not.toBeChecked();
    // The old primary becomes a normal kept image, still checked.
    expect(keepCheckboxes[0]).toBeChecked();

    // Uncheck, then re-check, the now-non-primary Base.png.
    fireEvent.click(keepCheckboxes[0]);
    expect(keepCheckboxes[0]).not.toBeChecked();
    fireEvent.click(keepCheckboxes[0]);
    expect(keepCheckboxes[0]).toBeChecked();
  });

  it("is a no-op when the already-selected primary image is clicked again", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
    });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    const primaryRadios = screen.getAllByRole("radio", { name: "Primary" });
    expect(primaryRadios[0]).toBeChecked();

    fireEvent.click(primaryRadios[0]);

    expect(primaryRadios[0]).toBeChecked();
    expect(primaryRadios[1]).not.toBeChecked();
  });

  it("removes a group and notifies the parent after a successful validation", async () => {
    const onChangesApplied = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    render(<DuplicateFinderModal open onClose={vi.fn()} onChangesApplied={onChangesApplied} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await waitFor(() => expect(screen.queryByText(/Anna - Base/)).not.toBeInTheDocument());
    expect(onChangesApplied).toHaveBeenCalledTimes(1);

    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe("/api/duplicates");
    expect(postCall[1]).toMatchObject({ method: "POST" });
  });

  it("shows a group-level error and keeps the group when validation fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
      })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await screen.findByText("Could not validate this group. Try again.");
    expect(screen.getByText(/Anna - Base/)).toBeInTheDocument();
  });

  it("shows a group-level error when validation throws", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
      })
      .mockRejectedValueOnce(new Error("network down"));

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await screen.findByText("Could not validate this group. Try again.");
    expect(screen.getByText(/Anna - Base/)).toBeInTheDocument();
  });

  it("closes the reject dialog without posting when cancel is clicked", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
    });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));
    expect(screen.getByRole("dialog", { name: "Reject group?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Reject group?" })).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes a group and notifies the parent after a successful rejection", async () => {
    const onChangesApplied = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    render(<DuplicateFinderModal open onClose={vi.fn()} onChangesApplied={onChangesApplied} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));

    await waitFor(() => expect(screen.queryByText(/Anna - Base/)).not.toBeInTheDocument());
    expect(onChangesApplied).toHaveBeenCalledTimes(1);

    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe("/api/duplicates");
    expect(postCall[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        primaryRelativePath: "characters/3d/Anna/Base.png",
        additionalKeptRelativePaths: [],
        rejectAll: true,
      }),
    });
  });

  it("shows a group-level error and keeps the group when rejection fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
      })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));

    await screen.findByText("Could not reject this group. Try again.");
    expect(screen.getByText(/Anna - Base/)).toBeInTheDocument();
  });

  it("shows a group-level error when rejection throws", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [buildGroup("group-a", "Anna")] }),
      })
      .mockRejectedValueOnce(new Error("network down"));

    render(<DuplicateFinderModal open onClose={vi.fn()} />);
    await screen.findByText(/Anna - Base/);

    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject group" }));

    await screen.findByText("Could not reject this group. Try again.");
    expect(screen.getByText(/Anna - Base/)).toBeInTheDocument();
  });
});
