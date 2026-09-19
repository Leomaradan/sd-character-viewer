import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const mockedFsModule = await import("../../__mocks__/fs.cjs");
  return mockedFsModule.default ?? mockedFsModule;
});

vi.mock("node:fs/promises", async () => {
  const mockedFsPromisesModule = await import("../../__mocks__/fs/promises.cjs");
  return mockedFsPromisesModule.default ?? mockedFsPromisesModule;
});

import { vol } from "memfs";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { IAnimationConfig, IImageItem } from "@/types/library";

import {
  reconcilePendingAnimationMarks,
  readToAnimateEntries,
  readToExtendEntries,
  readVideoLinks,
  removeVideoLink,
  setToAnimateEntry,
  setToExtendEntry,
} from "@/lib/image-library";

const TEMP_ROOT = "/tmp/sd-reconcile";

beforeEach(async () => {
  vol.reset();
  await fs.mkdir(TEMP_ROOT, { recursive: true });
});

const buildImage = (
  overrides: Partial<IImageItem> & Pick<IImageItem, "relativePath">,
): IImageItem => ({
  id: overrides.relativePath,
  style: "3d",
  characterName: "Anna",
  poseName: "Base",
  poseBaseName: "Base",
  poseVariant: 1,
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  mediaType: "image",
  ...overrides,
});

const DANCE_ANIMATIONS: IAnimationConfig[] = [{ key: "dance", name: "Dance", prompt: "" }];

const baseImage = buildImage({
  relativePath: "characters/3d/Anna/Base.png",
  poseName: "Base",
  poseBaseName: "Base",
  mediaType: "image",
});

const danceVideo = (overrides: Partial<IImageItem> = {}): IImageItem =>
  buildImage({
    relativePath: "characters/3d/Anna/Dance.mp4",
    poseName: "Dance",
    poseBaseName: "Dance",
    mediaType: "video",
    ...overrides,
  });

describe("reconcilePendingAnimationMarks", () => {
  it("is a no-op when there are no pending marks", async () => {
    const imageItems = [baseImage, danceVideo()];

    await reconcilePendingAnimationMarks(TEMP_ROOT, imageItems, DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
  });

  it("leaves a pending mark untouched when there are no candidate videos", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance", "");

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({
      [baseImage.relativePath]: { metadata: "raw", action: "dance", prompt: "" },
    });
  });

  it("links a single clean claim to its matching video and frees the mark", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "Steps: 30, Seed: 1", "dance", "");
    const video = danceVideo();

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({
      [video.relativePath]: {
        sourceRelativePath: baseImage.relativePath,
        sourceMediaType: "image",
        action: "dance",
        prompt: "",
        metadata: "Steps: 30, Seed: 1",
        linkedAt: expect.any(Number),
      },
    });
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({});
  });

  it("carries the mark's (possibly edited) prompt forward into the new video-links.json entry", async () => {
    await setToAnimateEntry(
      TEMP_ROOT,
      baseImage.relativePath,
      "raw",
      "dance",
      "edited by user, zoom in slowly",
    );
    const video = danceVideo();

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({
      [video.relativePath]: expect.objectContaining({
        prompt: "edited by user, zoom in slowly",
      }),
    });
  });

  it("pairs multiple claims to multiple candidates in FIFO order (by poseVariant)", async () => {
    // Insertion order matters here: the first mark set is the first claim.
    await setToAnimateEntry(TEMP_ROOT, "characters/3d/Anna/Base.png", "first", "dance", "");
    await setToAnimateEntry(TEMP_ROOT, "characters/3d/Anna/Base 2.png", "second", "dance", "");

    const firstSource = buildImage({ relativePath: "characters/3d/Anna/Base.png" });
    const secondSource = buildImage({
      relativePath: "characters/3d/Anna/Base 2.png",
      poseVariant: 2,
    });
    const firstVideo = danceVideo({
      relativePath: "characters/3d/Anna/Dance 2.mp4",
      poseVariant: 2,
    });
    const secondVideo = danceVideo({
      relativePath: "characters/3d/Anna/Dance.mp4",
      poseVariant: 1,
    });

    // Candidates are listed out of poseVariant order to prove sorting (not array order) governs
    // pairing: variant 1 ("Dance.mp4") must pair with the first claim, despite appearing second.
    await reconcilePendingAnimationMarks(
      TEMP_ROOT,
      [firstSource, secondSource, firstVideo, secondVideo],
      DANCE_ANIMATIONS,
    );

    const links = await readVideoLinks(TEMP_ROOT);
    expect(links["characters/3d/Anna/Dance.mp4"]).toEqual(
      expect.objectContaining({ sourceRelativePath: "characters/3d/Anna/Base.png" }),
    );
    expect(links["characters/3d/Anna/Dance 2.mp4"]).toEqual(
      expect.objectContaining({ sourceRelativePath: "characters/3d/Anna/Base 2.png" }),
    );
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({});
  });

  it("leaves a mark pending when its source image no longer exists", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance", "");
    const video = danceVideo();

    // baseImage is deliberately omitted from imageItems, simulating a deleted source.
    await reconcilePendingAnimationMarks(TEMP_ROOT, [video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({
      [baseImage.relativePath]: { metadata: "raw", action: "dance", prompt: "" },
    });
  });

  it("leaves a mark pending when its action key no longer resolves in the animations config", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "removed-key", "");
    const video = danceVideo();

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({
      [baseImage.relativePath]: { metadata: "raw", action: "removed-key", prompt: "" },
    });
  });

  it("excludes an extra-root video from candidates", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance", "");
    const extraRootVideo = danceVideo({
      relativePath: "extra-roots/0/characters/3d/Anna/Dance.mp4",
    });

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, extraRootVideo], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({
      [baseImage.relativePath]: { metadata: "raw", action: "dance", prompt: "" },
    });
  });

  it("leaves an already-linked video untouched and its claim still pending", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance", "");
    const video = danceVideo();
    const existingLink = {
      sourceRelativePath: "characters/3d/Anna/Other.png",
      sourceMediaType: "image" as const,
      action: "dance",
      prompt: "",
      metadata: "already-linked",
      linkedAt: 123,
    };
    const videoLinksPath = path.join(TEMP_ROOT, "video-links.json");
    await fs.writeFile(
      videoLinksPath,
      `${JSON.stringify({ [video.relativePath]: existingLink }, null, 2)}\n`,
    );

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS);

    // The pre-existing link is untouched (no new candidate was available to claim), and the
    // mark stays pending since nothing could claim it.
    expect(await readVideoLinks(TEMP_ROOT)).toEqual({ [video.relativePath]: existingLink });
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({
      [baseImage.relativePath]: { metadata: "raw", action: "dance", prompt: "" },
    });
  });

  it("processes to-animate.json entries before to-extends.json entries (file-order tie-break)", async () => {
    const extendSource = danceVideo({
      relativePath: "characters/3d/Anna/Dance-source.mp4",
      poseBaseName: "Dance-source",
    });
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "from-animate", "dance", "");
    await setToExtendEntry(TEMP_ROOT, extendSource.relativePath, "from-extend", "dance", "");

    // Only one candidate video is available, so only the animate claim (processed first) can
    // be fulfilled; the extend claim stays pending.
    const video = danceVideo();

    await reconcilePendingAnimationMarks(
      TEMP_ROOT,
      [baseImage, extendSource, video],
      DANCE_ANIMATIONS,
    );

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({
      [video.relativePath]: expect.objectContaining({
        sourceRelativePath: baseImage.relativePath,
        sourceMediaType: "image",
        metadata: "from-animate",
      }),
    });
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({});
    expect(await readToExtendEntries(TEMP_ROOT)).toEqual({
      [extendSource.relativePath]: { metadata: "from-extend", action: "dance", prompt: "" },
    });
  });

  it("fulfills both an animate claim and an extend claim when enough candidates exist", async () => {
    const extendSource = danceVideo({
      relativePath: "characters/3d/Anna/Dance-source.mp4",
      poseBaseName: "Dance-source",
    });
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "from-animate", "dance", "");
    await setToExtendEntry(TEMP_ROOT, extendSource.relativePath, "from-extend", "dance", "");

    const firstVideo = danceVideo({ relativePath: "characters/3d/Anna/Dance.mp4", poseVariant: 1 });
    const secondVideo = danceVideo({
      relativePath: "characters/3d/Anna/Dance 2.mp4",
      poseVariant: 2,
    });

    await reconcilePendingAnimationMarks(
      TEMP_ROOT,
      [baseImage, extendSource, firstVideo, secondVideo],
      DANCE_ANIMATIONS,
    );

    const links = await readVideoLinks(TEMP_ROOT);
    // File-order tie-break: the animate claim is processed first, so it claims the
    // lowest-poseVariant candidate; the extend claim gets the next one.
    expect(links[firstVideo.relativePath]).toEqual(
      expect.objectContaining({
        sourceRelativePath: baseImage.relativePath,
        sourceMediaType: "image",
      }),
    );
    expect(links[secondVideo.relativePath]).toEqual(
      expect.objectContaining({
        sourceRelativePath: extendSource.relativePath,
        sourceMediaType: "video",
      }),
    );
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({});
    expect(await readToExtendEntries(TEMP_ROOT)).toEqual({});
  });

  it("breaks a poseVariant tie between candidates by modifiedAt ascending", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance", "");

    const olderVideo = danceVideo({
      relativePath: "characters/3d/Anna/Dance-old.mp4",
      poseVariant: 1,
      modifiedAt: 100,
    });
    const newerVideo = danceVideo({
      relativePath: "characters/3d/Anna/Dance-new.mp4",
      poseVariant: 1,
      modifiedAt: 200,
    });

    // Listed newer-first, to prove modifiedAt (not array order) breaks the poseVariant tie.
    await reconcilePendingAnimationMarks(
      TEMP_ROOT,
      [baseImage, newerVideo, olderVideo],
      DANCE_ANIMATIONS,
    );

    const links = await readVideoLinks(TEMP_ROOT);
    expect(links[olderVideo.relativePath]).toEqual(
      expect.objectContaining({ sourceRelativePath: baseImage.relativePath }),
    );
    expect(links[newerVideo.relativePath]).toBeUndefined();
  });

  it("persists video-links.json through a single locked write, safe under a concurrent link write", async () => {
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance", "");
    const video = danceVideo();
    const otherRelativePath = "characters/3d/Anna/Other.mp4";
    const otherLink = {
      sourceRelativePath: "characters/3d/Anna/Other-source.png",
      sourceMediaType: "image" as const,
      action: "dance",
      prompt: "",
      metadata: "other",
      linkedAt: 999,
    };
    const videoLinksPath = path.join(TEMP_ROOT, "video-links.json");
    await fs.writeFile(
      videoLinksPath,
      `${JSON.stringify({ [otherRelativePath]: otherLink }, null, 2)}\n`,
    );

    // Both operations lock on the same video-links.json path; without that lock, one of these
    // read-modify-write cycles would clobber the other's change.
    await Promise.all([
      reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS),
      removeVideoLink(TEMP_ROOT, otherRelativePath),
    ]);

    const links = await readVideoLinks(TEMP_ROOT);
    expect(links[otherRelativePath]).toBeUndefined();
    expect(links[video.relativePath]).toEqual(
      expect.objectContaining({ sourceRelativePath: baseImage.relativePath }),
    );
  });

  it("matches a claim to a video whose filename normalizes underscores/hyphens differently than the animation's raw name", async () => {
    const animations: IAnimationConfig[] = [
      { key: "dance-party", name: "Dance_Party", prompt: "" },
    ];
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "raw", "dance-party", "");
    // A video named "Dance_Party.mp4" is parsed (via sanitizePoseName) to poseBaseName
    // "Dance Party" (underscore -> space) - the claim's groupKey must be sanitized the same way
    // to still match it.
    const video = buildImage({
      relativePath: "characters/3d/Anna/Dance Party.mp4",
      poseName: "Dance Party",
      poseBaseName: "Dance Party",
      mediaType: "video",
    });

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], animations);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({
      [video.relativePath]: expect.objectContaining({ sourceRelativePath: baseImage.relativePath }),
    });
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({});
  });

  it("does not let a video pending its own extend mark self-link or claim another pending claim", async () => {
    // Dance.mp4 is itself marked for extend targeting "dance" (whose name is also "Dance") - it
    // must not be treated as an unclaimed candidate for that claim (or any other).
    const video = danceVideo();
    await setToExtendEntry(TEMP_ROOT, video.relativePath, "raw", "dance", "");

    await reconcilePendingAnimationMarks(TEMP_ROOT, [video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
    expect(await readToExtendEntries(TEMP_ROOT)).toEqual({
      [video.relativePath]: { metadata: "raw", action: "dance", prompt: "" },
    });
  });

  it("does not let a video pending its own extend mark satisfy a different claim in the same group", async () => {
    const video = danceVideo();
    await setToExtendEntry(TEMP_ROOT, video.relativePath, "extend-raw", "dance", "");
    await setToAnimateEntry(TEMP_ROOT, baseImage.relativePath, "animate-raw", "dance", "");

    // video is the only video in this group, but it's excluded as a candidate (it's a pending
    // claim's own source), so the animate claim has nothing to pair with either.
    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({});
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({
      [baseImage.relativePath]: { metadata: "animate-raw", action: "dance", prompt: "" },
    });
    expect(await readToExtendEntries(TEMP_ROOT)).toEqual({
      [video.relativePath]: { metadata: "extend-raw", action: "dance", prompt: "" },
    });
  });

  it("clears a fulfilled mark written before the prompt field existed (no prompt key on disk)", async () => {
    // Simulates a to-animate.json entry from before Phase 5 - the compare-and-delete step must
    // normalize this the same way buildPendingAnimationClaims did when it built the claim, or the
    // raw (unnormalized) on-disk shape never deep-equals the always-normalized expected entry and
    // the mark is silently left behind forever.
    await fs.writeFile(
      path.join(TEMP_ROOT, "to-animate.json"),
      `${JSON.stringify({ [baseImage.relativePath]: { metadata: "raw", action: "dance" } }, null, 2)}\n`,
    );
    const video = danceVideo();

    await reconcilePendingAnimationMarks(TEMP_ROOT, [baseImage, video], DANCE_ANIMATIONS);

    expect(await readVideoLinks(TEMP_ROOT)).toEqual({
      [video.relativePath]: expect.objectContaining({ sourceRelativePath: baseImage.relativePath }),
    });
    expect(await readToAnimateEntries(TEMP_ROOT)).toEqual({});
  });
});
