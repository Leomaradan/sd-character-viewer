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
    readToUpscaleEntries: vi.fn(),
    removeToAnimateEntry: vi.fn(),
    removeToUpscaleEntry: vi.fn(),
    resolveImageFilePath: vi.fn(),
    setToAnimateEntry: vi.fn(),
    setToUpscaleEntry: vi.fn(),
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
  readToUpscaleEntries,
  removeToAnimateEntry,
  removeToUpscaleEntry,
  resolveImageFilePath,
  setToAnimateEntry,
  setToUpscaleEntry,
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

  it("returns 400 when the target is a video", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/tmp/a.mp4");
    vi.mocked(isVideoFilePath).mockReturnValueOnce(true);

    const response = await GET(new Request("http://localhost/api/marks?path=a.mp4"));

    expect(response.status).toBe(400);
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
      "a.png": { metadata: "raw", action: "Zoom In" },
    });

    const response = await GET(new Request("http://localhost/api/marks?path=a.png"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      upscale: true,
      animate: { action: "Zoom In" },
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

  it("returns 400 when the target is a video", async () => {
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

    expect(setToAnimateEntry).toHaveBeenCalledWith("/tmp", "a.png", "raw", "Zoom In");
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

    expect(setToAnimateEntry).toHaveBeenCalledWith("/tmp", "a.png", "raw", "latin-dance");
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

  it("returns 400 when the target is a video", async () => {
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
