import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  ensureLocalEnvLoaded: vi.fn(),
  readBooleanEnvFlag: vi.fn(),
}));

vi.mock("@/lib/image-library", async (importOriginal) => {
  // findAnimationNodeByKey is kept as the real implementation (pure, no fs) rather than stubbed,
  // since these tests exercise its actual key-lookup behavior via handleAnimateMark.
  const actual = await importOriginal<typeof import("@/lib/image-library")>();
  return {
    findAnimationNodeByKey: actual.findAnimationNodeByKey,
    getImagesRootPathFromEnv: vi.fn(),
    readImageLibrary: vi.fn(),
    readToAnimateEntries: vi.fn(),
    readToExtendEntries: vi.fn(),
    readToUpscaleEntries: vi.fn(),
    readToUpscaleVideoEntries: vi.fn(),
    readVideoLinks: vi.fn(),
    removeToAnimateEntry: vi.fn(),
    removeToExtendEntry: vi.fn(),
    removeToUpscaleEntry: vi.fn(),
    removeToUpscaleVideoEntry: vi.fn(),
    resolveImageFilePath: vi.fn(),
    setToAnimateEntry: vi.fn(),
    setToExtendEntry: vi.fn(),
    setToUpscaleEntry: vi.fn(),
    setToUpscaleVideoEntry: vi.fn(),
    isVideoFilePath: vi.fn(() => false),
  };
});

import * as auth from "@/lib/auth";
import * as env from "@/lib/env";
import {
  getImagesRootPathFromEnv,
  isVideoFilePath,
  readImageLibrary,
  readToAnimateEntries,
  readToExtendEntries,
  readToUpscaleEntries,
  readToUpscaleVideoEntries,
  readVideoLinks,
  removeToAnimateEntry,
  removeToExtendEntry,
  removeToUpscaleEntry,
  removeToUpscaleVideoEntry,
  resolveImageFilePath,
  setToAnimateEntry,
  setToExtendEntry,
  setToUpscaleEntry,
  setToUpscaleVideoEntry,
} from "@/lib/image-library";

import { DELETE, GET, PUT } from "./route";

const jsonRequest = (url: string, method: string, body: unknown): Request =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/marks GET", () => {
  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/marks?path=a.png"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("returns the current mark state for a video", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(readToUpscaleVideoEntries).mockResolvedValue({ "a.mp4": "" });
    vi.mocked(readToExtendEntries).mockResolvedValue({
      "a.mp4": { metadata: "", action: "Zoom In", prompt: "zoom in slowly" },
    });
    vi.mocked(readVideoLinks).mockResolvedValue({});

    const response = await GET(new Request("http://localhost/api/marks?path=a.mp4"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      upscaleVideo: true,
      extend: { action: "Zoom In", prompt: "zoom in slowly" },
      link: null,
    });
  });

  it("returns unmarked state when the video has no entries", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(readToUpscaleVideoEntries).mockResolvedValue({});
    vi.mocked(readToExtendEntries).mockResolvedValue({});
    vi.mocked(readVideoLinks).mockResolvedValue({});

    const response = await GET(new Request("http://localhost/api/marks?path=a.mp4"));

    await expect(response.json()).resolves.toEqual({
      upscaleVideo: false,
      extend: null,
      link: null,
    });
  });

  it("returns the video's source link when reconciliation has matched it", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(readToUpscaleVideoEntries).mockResolvedValue({});
    vi.mocked(readToExtendEntries).mockResolvedValue({});
    const link = {
      sourceRelativePath: "characters/3d/Anna/Base.png",
      sourceMediaType: "image" as const,
      action: "dance",
      prompt: "zoom in slowly",
      metadata: "Steps: 30",
      linkedAt: 1234,
    };
    vi.mocked(readVideoLinks).mockResolvedValue({ "a.mp4": link });

    const response = await GET(new Request("http://localhost/api/marks?path=a.mp4"));

    await expect(response.json()).resolves.toEqual({
      upscaleVideo: false,
      extend: null,
      link,
    });
  });

  it("returns unauthorized when auth fails", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/marks?path=a.png"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid image path", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/marks?path=bad"));

    expect(response.status).toBe(400);
  });

  it("returns 400 when the image library is not configured", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue(null);

    const response = await GET(new Request("http://localhost/api/marks?path=a.png"));

    expect(response.status).toBe(400);
  });

  it("returns the current mark state for the image", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(readToUpscaleEntries).mockResolvedValue({ "a.png": "raw" });
    vi.mocked(readToAnimateEntries).mockResolvedValue({
      "a.png": { metadata: "raw", action: "Zoom In", prompt: "slow zoom" },
    });

    const response = await GET(new Request("http://localhost/api/marks?path=a.png"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      upscale: true,
      animate: { action: "Zoom In", prompt: "slow zoom" },
    });
  });

  it("returns unmarked state when the image has no entries", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(readToUpscaleEntries).mockResolvedValue({});
    vi.mocked(readToAnimateEntries).mockResolvedValue({});

    const response = await GET(new Request("http://localhost/api/marks?path=a.png"));

    await expect(response.json()).resolves.toEqual({ upscale: false, animate: null });
  });
});

describe("/api/marks PUT", () => {
  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.png", type: "upscale" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("returns unauthorized when auth fails", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.png", type: "upscale" }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when marking is disabled", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(false);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.png", type: "upscale" }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 for an invalid request body", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);

    const response = await PUT(
      new Request("http://localhost/api/marks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid image path", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue(null);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "bad", type: "upscale" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an image-only mark type (upscale) targeting a video", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.mp4", type: "upscale" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for a video-only mark type (extend) targeting an image", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "extend",
        action: "Zoom In",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the image library is not configured", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue(null);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.png", type: "upscale" }),
    );

    expect(response.status).toBe(400);
  });

  it("marks an image for upscale", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(setToUpscaleEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "upscale",
        metadata: "raw",
      }),
    );

    expect(setToUpscaleEntry).toHaveBeenCalledWith("/tmp", "a.png", "raw");
    expect(response.status).toBe(204);
  });

  it("returns 400 for an animate mark with no action", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.png", type: "animate" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an animate mark with an action not in config.json", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Pan", name: "Pan", prompt: "" }],
    } as never);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 500 when the image library fails to load for an animate mark", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(readImageLibrary).mockRejectedValue(new Error("ENOENT"));

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("marks an image for animate with a configured action", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [
        { key: "Zoom In", name: "Zoom In", prompt: "" },
        { key: "Pan", name: "Pan", prompt: "" },
      ],
    } as never);
    vi.mocked(setToAnimateEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
        metadata: "raw",
      }),
    );

    expect(setToAnimateEntry).toHaveBeenCalledWith("/tmp", "a.png", "raw", "Zoom In", "");
    expect(response.status).toBe(204);
  });

  it("seeds the prompt from the resolved node's configured prompt when the client omits it", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "zoom in slowly" }],
    } as never);
    vi.mocked(setToAnimateEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
        metadata: "raw",
      }),
    );

    expect(setToAnimateEntry).toHaveBeenCalledWith(
      "/tmp",
      "a.png",
      "raw",
      "Zoom In",
      "zoom in slowly",
    );
    expect(response.status).toBe(204);
  });

  it("uses a client-supplied prompt instead of the node's configured default", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "zoom in slowly" }],
    } as never);
    vi.mocked(setToAnimateEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
        metadata: "raw",
        prompt: "edited by user",
      }),
    );

    expect(setToAnimateEntry).toHaveBeenCalledWith(
      "/tmp",
      "a.png",
      "raw",
      "Zoom In",
      "edited by user",
    );
    expect(response.status).toBe(204);
  });

  it("preserves the mark's existing metadata when Edit Animation omits it (prompt-only edit)", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "" }],
    } as never);
    vi.mocked(readToAnimateEntries).mockResolvedValue({
      "a.png": { metadata: "Steps: 30, Seed: 1", action: "Zoom In", prompt: "old prompt" },
    });
    vi.mocked(setToAnimateEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
        prompt: "edited by user",
      }),
    );

    expect(setToAnimateEntry).toHaveBeenCalledWith(
      "/tmp",
      "a.png",
      "Steps: 30, Seed: 1",
      "Zoom In",
      "edited by user",
    );
    expect(response.status).toBe(204);
  });

  it('defaults metadata to "" for a brand-new mark when the client omits it', async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "" }],
    } as never);
    vi.mocked(readToAnimateEntries).mockResolvedValue({});
    vi.mocked(setToAnimateEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "Zoom In",
      }),
    );

    expect(setToAnimateEntry).toHaveBeenCalledWith("/tmp", "a.png", "", "Zoom In", "");
    expect(response.status).toBe(204);
  });

  it("marks an image for animate with a nested sub-version action key", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [
        {
          key: "dance",
          name: "Dance",
          prompt: "",
          subVersions: [{ key: "latin-dance", name: "Latin Dance", prompt: "" }],
        },
      ],
    } as never);
    vi.mocked(setToAnimateEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.png",
        type: "animate",
        action: "latin-dance",
        metadata: "raw",
      }),
    );

    expect(setToAnimateEntry).toHaveBeenCalledWith("/tmp", "a.png", "raw", "latin-dance", "");
    expect(response.status).toBe(204);
  });

  it("returns 400 for an unknown mark type", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.png", type: "bogus" }),
    );

    expect(response.status).toBe(400);
  });

  it("marks a video for upscaleVideo, ignoring any client-supplied metadata", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(readVideoLinks).mockResolvedValue({});
    vi.mocked(setToUpscaleVideoEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "upscaleVideo",
        metadata: "client-supplied, should be ignored",
      }),
    );

    expect(setToUpscaleVideoEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "");
    expect(response.status).toBe(204);
  });

  it("marks a video for upscaleVideo with the metadata carried forward from its video-links.json entry", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(readVideoLinks).mockResolvedValue({
      "a.mp4": {
        sourceRelativePath: "characters/3d/Anna/Base.png",
        sourceMediaType: "image",
        action: "Zoom In",
        prompt: "",
        metadata: "Steps: 30, Seed: 1",
        linkedAt: 0,
      },
    });
    vi.mocked(setToUpscaleVideoEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.mp4", type: "upscaleVideo" }),
    );

    expect(setToUpscaleVideoEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "Steps: 30, Seed: 1");
    expect(response.status).toBe(204);
  });

  it("returns 400 for an extend mark with no action", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", { path: "a.mp4", type: "extend" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an extend mark with an action not in config.json", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Pan", name: "Pan", prompt: "" }],
    } as never);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "Zoom In",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 500 when the image library fails to load for an extend mark", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(readImageLibrary).mockRejectedValue(new Error("ENOENT"));

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "Zoom In",
      }),
    );

    expect(response.status).toBe(500);
  });

  it("marks a video for extend with a configured action, ignoring client-supplied metadata", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "" }],
    } as never);
    vi.mocked(readVideoLinks).mockResolvedValue({});
    vi.mocked(setToExtendEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "Zoom In",
        metadata: "client-supplied, should be ignored",
      }),
    );

    expect(setToExtendEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "", "Zoom In", "");
    expect(response.status).toBe(204);
  });

  it("marks a video for extend with the metadata carried forward from its video-links.json entry", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Pan", name: "Pan", prompt: "" }],
    } as never);
    vi.mocked(readVideoLinks).mockResolvedValue({
      "a.mp4": {
        sourceRelativePath: "characters/3d/Anna/Dance.mp4",
        sourceMediaType: "video",
        action: "Zoom In",
        prompt: "",
        metadata: "raw",
        linkedAt: 0,
      },
    });
    vi.mocked(setToExtendEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "Pan",
      }),
    );

    expect(setToExtendEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "raw", "Pan", "");
    expect(response.status).toBe(204);
  });

  it("marks a video for extend with a nested sub-version action key", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [
        {
          key: "dance",
          name: "Dance",
          prompt: "",
          subVersions: [{ key: "latin-dance", name: "Latin Dance", prompt: "" }],
        },
      ],
    } as never);
    vi.mocked(readVideoLinks).mockResolvedValue({});
    vi.mocked(setToExtendEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "latin-dance",
      }),
    );

    expect(setToExtendEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "", "latin-dance", "");
    expect(response.status).toBe(204);
  });

  it("seeds an extend mark's prompt from the resolved node's configured prompt when omitted", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "zoom in slowly" }],
    } as never);
    vi.mocked(readVideoLinks).mockResolvedValue({});
    vi.mocked(setToExtendEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "Zoom In",
      }),
    );

    expect(setToExtendEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "", "Zoom In", "zoom in slowly");
    expect(response.status).toBe(204);
  });

  it("uses a client-supplied prompt for an extend mark instead of the node's configured default", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.mocked(readImageLibrary).mockResolvedValue({
      animations: [{ key: "Zoom In", name: "Zoom In", prompt: "zoom in slowly" }],
    } as never);
    vi.mocked(readVideoLinks).mockResolvedValue({});
    vi.mocked(setToExtendEntry).mockResolvedValue(undefined);

    const response = await PUT(
      jsonRequest("http://localhost/api/marks", "PUT", {
        path: "a.mp4",
        type: "extend",
        action: "Zoom In",
        prompt: "edited by user",
      }),
    );

    expect(setToExtendEntry).toHaveBeenCalledWith("/tmp", "a.mp4", "", "Zoom In", "edited by user");
    expect(response.status).toBe(204);
  });
});

describe("/api/marks DELETE", () => {
  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=upscale", { method: "DELETE" }),
    );

    expect(response.status).toBe(200);
  });

  it("returns unauthorized when auth fails", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=upscale", { method: "DELETE" }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when marking is disabled", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(false);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=upscale", { method: "DELETE" }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 for an invalid image path", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=bad&type=upscale", { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an image-only mark type (upscale) targeting a video", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.mp4&type=upscale", { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for a video-only mark type (upscaleVideo) targeting an image", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=upscaleVideo", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the image library is not configured", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=upscale", { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
  });

  it("removes an upscale mark", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(removeToUpscaleEntry).mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=upscale", { method: "DELETE" }),
    );

    expect(removeToUpscaleEntry).toHaveBeenCalledWith("/tmp", "a.png");
    expect(response.status).toBe(204);
  });

  it("removes an animate mark", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(removeToAnimateEntry).mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=animate", { method: "DELETE" }),
    );

    expect(removeToAnimateEntry).toHaveBeenCalledWith("/tmp", "a.png");
    expect(response.status).toBe(204);
  });

  it("removes an upscaleVideo mark", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(removeToUpscaleVideoEntry).mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.mp4&type=upscaleVideo", {
        method: "DELETE",
      }),
    );

    expect(removeToUpscaleVideoEntry).toHaveBeenCalledWith("/tmp", "a.mp4");
    expect(response.status).toBe(204);
  });

  it("removes an extend mark", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);
    vi.mocked(removeToExtendEntry).mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.mp4&type=extend", { method: "DELETE" }),
    );

    expect(removeToExtendEntry).toHaveBeenCalledWith("/tmp", "a.mp4");
    expect(response.status).toBe(204);
  });

  it("returns 400 for an unknown mark type", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.png");
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/tmp");

    const response = await DELETE(
      new Request("http://localhost/api/marks?path=a.png&type=bogus", { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
  });
});
