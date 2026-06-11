import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@next/env", () => ({
  loadEnvConfig: vi.fn(),
}));

import { loadEnvConfig } from "@next/env";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";

describe("env", () => {
  const loadEnvConfigMock = vi.mocked(loadEnvConfig);
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SD_ALLOW_DELETE;
    delete process.env.SD_IMAGES_ROOT;
    delete process.env.SD_PASSWORD;
    delete process.env.SD_PASSWORD_SALT;
  });

  it("parses boolean flags", () => {
    expect(readBooleanEnvFlag(true)).toBe(true);
    expect(readBooleanEnvFlag("TRUE")).toBe(true);
    expect(readBooleanEnvFlag("1")).toBe(true);
    expect(readBooleanEnvFlag("yes")).toBe(true);
    expect(readBooleanEnvFlag("no")).toBe(false);
    expect(readBooleanEnvFlag(undefined)).toBe(false);
  });

  it("loads env config and logs detected SD env vars", () => {
    process.env.SD_IMAGES_ROOT = "/tmp/images";

    ensureLocalEnvLoaded();

    expect(loadEnvConfigMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toContain("[env] SD_ environment variables:");
    expect(logSpy.mock.calls[0]?.[1]).toMatchObject({
      SD_IMAGES_ROOT: "(set)",
      SD_ALLOW_DELETE: "(not set)",
    });

    ensureLocalEnvLoaded();
    expect(loadEnvConfigMock).toHaveBeenCalledTimes(1);
  });
});
