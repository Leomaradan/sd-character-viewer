import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const mockedFsModule = await import("../../../../__mocks__/fs.cjs");
  return mockedFsModule.default ?? mockedFsModule;
});

vi.mock("node:fs/promises", async () => {
  const mockedFsPromisesModule = await import("../../../../__mocks__/fs/promises.cjs");
  return mockedFsPromisesModule.default ?? mockedFsPromisesModule;
});

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: vi.fn(),
  isMisconfigured: vi.fn(),
  isPasswordProtectionEnabled: vi.fn(),
}));

vi.mock("@/app/api/metadata/route", () => ({
  invalidateMetadataCacheEntry: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  ensureLocalEnvLoaded: vi.fn(),
  readBooleanEnvFlag: vi.fn(),
}));

import path from "node:path";
import { promises as fs } from "node:fs";
import { vol } from "memfs";
import * as auth from "@/lib/auth";
import * as env from "@/lib/env";
import { GET, POST } from "./route";

beforeEach(() => {
  vol.reset();
  vi.clearAllMocks();
  delete process.env.SD_IMAGES_ROOT;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SD_IMAGES_ROOT;
});

describe("GET /api/duplicates", () => {
  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await GET(new Request("http://localhost/api/duplicates"));

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

    const response = await GET(new Request("http://localhost/api/duplicates"));

    expect(response.status).toBe(401);
  });

  it("returns an empty list when the library root is not configured", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);

    const response = await GET(new Request("http://localhost/api/duplicates"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ groups: [] });
  });

  it("returns duplicate groups, excluding groups already reviewed for their current files", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);

    const tempRoot = "/tmp/sd-dup-get";
    const annaDir = path.join(tempRoot, "characters", "3d", "Anna");
    const bobDir = path.join(tempRoot, "characters", "3d", "Bob");
    await fs.mkdir(annaDir, { recursive: true });
    await fs.mkdir(bobDir, { recursive: true });
    await fs.writeFile(path.join(annaDir, "Base.png"), "");
    await fs.writeFile(path.join(annaDir, "Base 2.png"), "");
    await fs.writeFile(path.join(bobDir, "Base.png"), "");
    await fs.writeFile(path.join(bobDir, "Base 2.png"), "");
    await fs.writeFile(
      path.join(tempRoot, "duplicate-reviews.json"),
      JSON.stringify([
        {
          style: "3d",
          characterName: "Bob",
          poseBaseName: "Base",
          fileNames: ["Base.png", "Base 2.png"],
        },
      ]),
    );

    process.env.SD_IMAGES_ROOT = tempRoot;

    const response = await GET(new Request("http://localhost/api/duplicates"));
    const body = (await response.json()) as {
      groups: Array<{ characterName: string; poseBaseName: string }>;
    };

    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].characterName).toBe("Anna");
    expect(body.groups[0].poseBaseName).toBe("Base");
  });
});

describe("POST /api/duplicates", () => {
  it("returns misconfigured payload", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(true);

    const response = await POST(new Request("http://localhost/api/duplicates", { method: "POST" }));

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

    const response = await POST(new Request("http://localhost/api/duplicates", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("returns 403 when duplicate management is disabled", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/duplicates", { method: "POST" }));

    expect(response.status).toBe(403);
  });

  it("returns 400 on an invalid request body", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    process.env.SD_IMAGES_ROOT = "/tmp/sd-dup-post-bad-body";

    const response = await POST(
      new Request("http://localhost/api/duplicates", {
        method: "POST",
        body: JSON.stringify({ primaryRelativePath: "" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid image path", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);
    process.env.SD_IMAGES_ROOT = "/tmp/sd-dup-post-bad-path";

    const response = await POST(
      new Request("http://localhost/api/duplicates", {
        method: "POST",
        body: JSON.stringify({
          primaryRelativePath: "../secret.png",
          additionalKeptRelativePaths: [],
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("keeps the primary as the unnumbered file, renumbers extra kept files, deletes the rest, and records the review", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);

    const tempRoot = "/tmp/sd-dup-post-validate";
    const annaDir = path.join(tempRoot, "characters", "3d", "Anna");
    await fs.mkdir(annaDir, { recursive: true });
    await fs.writeFile(path.join(annaDir, "Base.png"), "");
    await fs.writeFile(path.join(annaDir, "Base 2.png"), "");
    await fs.writeFile(path.join(annaDir, "Base 3.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;

    const response = await POST(
      new Request("http://localhost/api/duplicates", {
        method: "POST",
        body: JSON.stringify({
          primaryRelativePath: "characters/3d/Anna/Base 2.png",
          additionalKeptRelativePaths: ["characters/3d/Anna/Base 3.png"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      style: "3d",
      characterName: "Anna",
      poseBaseName: "Base",
      fileNames: ["Base 2.png", "Base.png"].sort(),
    });

    const remainingFiles = (await fs.readdir(annaDir)).sort();
    expect(remainingFiles).toEqual(["Base 2.png", "Base.png"]);

    const reviewedRaw = await fs.readFile(path.join(tempRoot, "duplicate-reviews.json"), "utf8");
    const reviewed = JSON.parse(reviewedRaw as string) as Array<{
      style: string;
      characterName: string;
      poseBaseName: string;
      fileNames: string[];
    }>;

    expect(reviewed).toEqual([
      {
        style: "3d",
        characterName: "Anna",
        poseBaseName: "Base",
        fileNames: ["Base 2.png", "Base.png"].sort(),
      },
    ]);
  });

  it("does not lose a reviewed record when two different groups are validated concurrently", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);

    const tempRoot = "/tmp/sd-dup-post-concurrent";
    const annaDir = path.join(tempRoot, "characters", "3d", "Anna");
    const bobDir = path.join(tempRoot, "characters", "3d", "Bob");
    await fs.mkdir(annaDir, { recursive: true });
    await fs.mkdir(bobDir, { recursive: true });
    await fs.writeFile(path.join(annaDir, "Base.png"), "");
    await fs.writeFile(path.join(annaDir, "Base 2.png"), "");
    await fs.writeFile(path.join(bobDir, "Base.png"), "");
    await fs.writeFile(path.join(bobDir, "Base 2.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;

    const buildRequest = (characterName: string) =>
      new Request("http://localhost/api/duplicates", {
        method: "POST",
        body: JSON.stringify({
          primaryRelativePath: `characters/3d/${characterName}/Base.png`,
          additionalKeptRelativePaths: [`characters/3d/${characterName}/Base 2.png`],
        }),
      });

    const [annaResponse, bobResponse] = await Promise.all([
      POST(buildRequest("Anna")),
      POST(buildRequest("Bob")),
    ]);

    expect(annaResponse.status).toBe(200);
    expect(bobResponse.status).toBe(200);

    const reviewedRaw = await fs.readFile(path.join(tempRoot, "duplicate-reviews.json"), "utf8");
    const reviewed = JSON.parse(reviewedRaw as string) as Array<{ characterName: string }>;

    expect(reviewed.map((entry) => entry.characterName).sort()).toEqual(["Anna", "Bob"]);
  });

  it("serializes two concurrent validations for the same group instead of interleaving their file operations", async () => {
    vi.mocked(auth.isMisconfigured).mockReturnValue(false);
    vi.mocked(auth.isPasswordProtectionEnabled).mockReturnValue(false);
    vi.mocked(env.readBooleanEnvFlag).mockReturnValue(true);

    const tempRoot = "/tmp/sd-dup-post-same-group-concurrent";
    const annaDir = path.join(tempRoot, "characters", "3d", "Anna");
    await fs.mkdir(annaDir, { recursive: true });
    await fs.writeFile(path.join(annaDir, "Base.png"), "");
    await fs.writeFile(path.join(annaDir, "Base 2.png"), "");
    await fs.writeFile(path.join(annaDir, "Base 3.png"), "");

    process.env.SD_IMAGES_ROOT = tempRoot;

    // Two conflicting requests for the same group, submitted concurrently (e.g. from two tabs).
    const firstRequest = new Request("http://localhost/api/duplicates", {
      method: "POST",
      body: JSON.stringify({
        primaryRelativePath: "characters/3d/Anna/Base.png",
        additionalKeptRelativePaths: ["characters/3d/Anna/Base 2.png"],
      }),
    });
    const secondRequest = new Request("http://localhost/api/duplicates", {
      method: "POST",
      body: JSON.stringify({
        primaryRelativePath: "characters/3d/Anna/Base 3.png",
        additionalKeptRelativePaths: [],
      }),
    });

    const [firstResponse, secondResponse] = await Promise.all([
      POST(firstRequest),
      POST(secondRequest),
    ]);

    // Whichever request runs first fully wins; the other must observe its result (files it
    // referenced may already be gone) rather than partially interleaving with it. Neither
    // outcome should be a 500 caused by racing filesystem operations.
    const statuses = [firstResponse.status, secondResponse.status].sort();
    expect(statuses).toEqual([200, 400]);

    const remainingFiles = (await fs.readdir(annaDir)).sort();
    expect(remainingFiles).toEqual(["Base 2.png", "Base.png"]);
  });
});
