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

vi.mock("@/app/api/metadata/route", () => ({
  invalidateMetadataCacheEntry: vi.fn(),
}));

vi.mock("@/lib/image-library", () => ({
  getImagesRootPathFromEnv: vi.fn(),
  isVideoFilePath: vi.fn((filePath: string) => filePath.toLowerCase().endsWith(".mp4")),
  readCustomPoseEntries: vi.fn(),
  readImageLibrary: vi.fn(),
  renameMediaFile: vi.fn(),
  resolveImageFilePath: vi.fn(),
  setCustomPoseEntry: vi.fn(),
  MediaRenameError: class MediaRenameError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import type { IImageItem, ILibraryData } from "@/types/library";

import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import * as auth from "@/lib/auth";
import * as env from "@/lib/env";
import {
  getImagesRootPathFromEnv,
  MediaRenameError,
  readCustomPoseEntries,
  readImageLibrary,
  renameMediaFile,
  resolveImageFilePath,
  setCustomPoseEntry,
} from "@/lib/image-library";

import { GET, POST } from "./route";

const buildImage = (relativePath: string, poseFilterName: string): IImageItem => ({
  id: relativePath,
  style: "3d",
  characterName: "Anna",
  poseName: poseFilterName,
  poseBaseName: poseFilterName,
  poseFilterName,
  poseVariant: 1,
  relativePath,
  isNew: false,
  firstSeenAt: 0,
  modifiedAt: 0,
  posePatternFilterIds: [],
  mediaType: relativePath.endsWith(".mp4") ? "video" : "image",
});

const buildLibrary = (overrides: Partial<ILibraryData> = {}): ILibraryData =>
  ({
    rootConfigured: true,
    rootPath: "/root",
    standardPoses: ["Casual", "Dancing"],
    images: [
      buildImage("characters/3d/Anna/Base.png", "Base"),
      buildImage("characters/3d/Anna/Casual.png", "Casual"),
      buildImage("characters/3d/Anna/Casul.png", "Casul"),
      buildImage("characters/3d/Anna/Odd.png", "Odd"),
      buildImage("characters/3d/Anna/Jumping (Test).mp4", "Test"),
    ],
    ...overrides,
  }) as ILibraryData;

const allowRequests = () => {
  vi.mocked(auth.isMisconfigured).mockReturnValue(false);
  vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
  vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
  vi.mocked(getImagesRootPathFromEnv).mockReturnValue("/root");
  vi.mocked(resolveImageFilePath).mockReturnValue("/root/file");
  vi.mocked(readImageLibrary).mockResolvedValue(buildLibrary());
};

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/pose-conformity", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/pose-conformity", () => {
  it("returns the misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/pose-conformity"));

    expect(await response.json()).toEqual({
      misconfigured: true,
      required: true,
      authenticated: false,
    });
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/pose-conformity"));

    expect(response.status).toBe(401);
  });

  it("lists non-conforming items that aren't marked custom", async () => {
    allowRequests();
    vi.mocked(readCustomPoseEntries).mockResolvedValue({ "characters/3d/Anna/Odd.png": 1 });

    const response = await GET(new Request("http://localhost/api/pose-conformity"));
    const data = (await response.json()) as { standardPoses: string[]; items: IImageItem[] };

    expect(data.standardPoses).toEqual(["Casual", "Dancing"]);
    expect(data.items.map((item) => item.relativePath)).toEqual([
      "characters/3d/Anna/Casul.png",
      "characters/3d/Anna/Jumping (Test).mp4",
    ]);
  });

  it("returns no items when no standard poses are configured", async () => {
    allowRequests();
    vi.mocked(readImageLibrary).mockResolvedValue(buildLibrary({ standardPoses: [] }));

    const response = await GET(new Request("http://localhost/api/pose-conformity"));

    expect(await response.json()).toEqual({ standardPoses: [], items: [] });
    expect(readCustomPoseEntries).not.toHaveBeenCalled();
  });
});

describe("POST /api/pose-conformity", () => {
  it("returns the misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await post({ path: "a.png", pose: "Casual" });

    expect(await response.json()).toMatchObject({ misconfigured: true });
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(true);
    vi.mocked(auth.isAuthenticatedRequest).mockReturnValue(false);

    expect((await post({ path: "a.png", pose: "Casual" })).status).toBe(401);
  });

  it("is disabled without SD_ALLOW_DELETE", async () => {
    allowRequests();
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(false);

    expect((await post({ path: "a.png", pose: "Casual" })).status).toBe(403);
  });

  it("needs a configured library root", async () => {
    allowRequests();
    vi.mocked(getImagesRootPathFromEnv).mockReturnValue(null);

    expect((await post({ path: "a.png", pose: "Casual" })).status).toBe(400);
  });

  it("rejects malformed bodies and invalid paths", async () => {
    allowRequests();

    expect((await post("not json")).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect((await post({ pose: "Casual" })).status).toBe(400);
    expect((await post({ path: "a.png" })).status).toBe(400);

    expect((await post({ path: "characters/3d/./Anna/Odd.png", custom: true })).status).toBe(400);
    expect((await post({ path: "characters/3d/Bob/../Anna/Odd.png", custom: true })).status).toBe(
      400,
    );
    expect(setCustomPoseEntry).not.toHaveBeenCalled();

    vi.mocked(resolveImageFilePath).mockReturnValue(null);
    expect((await post({ path: "../a.png", pose: "Casual" })).status).toBe(400);
    expect(renameMediaFile).not.toHaveBeenCalled();
  });

  it("marks an item as a custom pose", async () => {
    allowRequests();

    const response = await post({ path: "characters/3d/Anna/Odd.png", custom: true });

    expect(response.status).toBe(204);
    expect(setCustomPoseEntry).toHaveBeenCalledWith("/root", "characters/3d/Anna/Odd.png");
    expect(renameMediaFile).not.toHaveBeenCalled();
  });

  it("rejects a pose that isn't a standard pose", async () => {
    allowRequests();

    expect((await post({ path: "characters/3d/Anna/Casul.png", pose: "Nope" })).status).toBe(400);
  });

  it("renames an image to the standard pose spelling, numbering on conflict", async () => {
    allowRequests();
    vi.mocked(renameMediaFile).mockResolvedValue("characters/3d/Anna/Casual 2.png");

    const response = await post({ path: "characters/3d/Anna/Casul.png", pose: "casual" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ newPath: "characters/3d/Anna/Casual 2.png" });
    expect(renameMediaFile).toHaveBeenCalledWith("characters/3d/Anna/Casul.png", "Casual", {
      incrementOnConflict: true,
    });
    expect(invalidateMetadataCacheEntry).toHaveBeenCalledWith("characters/3d/Anna/Casual 2.png");
  });

  it("replaces only the pose part of an animation video", async () => {
    allowRequests();
    vi.mocked(renameMediaFile).mockResolvedValue("characters/3d/Anna/Jumping (Dancing).mp4");

    await post({ path: "characters/3d/Anna/Jumping (Test).mp4", pose: "Dancing" });

    expect(renameMediaFile).toHaveBeenCalledWith(
      "characters/3d/Anna/Jumping (Test).mp4",
      "Jumping (Dancing)",
      { incrementOnConflict: true },
    );
  });

  it("maps rename errors to HTTP statuses", async () => {
    allowRequests();
    vi.mocked(renameMediaFile).mockRejectedValueOnce(
      new MediaRenameError("not-found", "File not found"),
    );
    vi.mocked(renameMediaFile).mockRejectedValueOnce(new Error("disk full"));

    const notFound = await post({ path: "characters/3d/Anna/Casul.png", pose: "Casual" });
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toBe("File not found");

    expect((await post({ path: "characters/3d/Anna/Casul.png", pose: "Casual" })).status).toBe(500);
  });
});
