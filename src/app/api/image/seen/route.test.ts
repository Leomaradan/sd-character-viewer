import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  markImageAsSeen: vi.fn(),
  resolveImageFilePath: vi.fn(),
}));

import * as auth from "@/lib/auth";
import { markImageAsSeen, resolveImageFilePath } from "@/lib/image-library";

import { POST } from "./route";

describe("/api/image/seen POST", () => {
  afterEach(() => {
    vi.mocked(auth.isMisconfigured).mockReset();
    vi.mocked(auth.isPasswordProtectionEnabled).mockReset();
    vi.mocked(auth.isAuthenticatedRequest).mockReset();
    vi.mocked(resolveImageFilePath).mockReset();
    vi.mocked(markImageAsSeen).mockReset();
  });

  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost/api/image/seen?path=a.png", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
    expect(markImageAsSeen).not.toHaveBeenCalled();
  });

  it("returns unauthorized when protected and not authenticated", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/image/seen?path=a.png", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(markImageAsSeen).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid image path", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost/api/image/seen?path=a.png", { method: "POST" }),
    );

    expect(response.status).toBe(400);
    expect(markImageAsSeen).not.toHaveBeenCalled();
  });

  it("returns 400 when no path query param is provided", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/image/seen", { method: "POST" }));

    expect(response.status).toBe(400);
    expect(resolveImageFilePath).not.toHaveBeenCalled();
    expect(markImageAsSeen).not.toHaveBeenCalled();
  });

  it("marks the requested image as seen and does not require SD_ALLOW_DELETE", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(resolveImageFilePath).mockReturnValue("/root/characters/3d/Anna/Base.png");
    vi.mocked(markImageAsSeen).mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/image/seen?path=characters/3d/Anna/Base.png", {
        method: "POST",
      }),
    );

    expect(markImageAsSeen).toHaveBeenCalledWith("characters/3d/Anna/Base.png");
    expect(response.status).toBe(204);
  });
});
