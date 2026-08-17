// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateFinderModal } from "@/components/image-viewer/DuplicateFinderModal";
import type { IDuplicateGroup, IImageItem } from "@/types/library";

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
  ...overrides,
});

const buildGroup = (id: string, characterName: string): IDuplicateGroup => ({
  id,
  style: "3d",
  characterName,
  poseBaseName: "Base",
  images: [
    buildImage({ relativePath: `characters/3d/${characterName}/Base.png`, characterName }),
    buildImage({
      relativePath: `characters/3d/${characterName}/Base 2.png`,
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
        observe() {}
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
});
