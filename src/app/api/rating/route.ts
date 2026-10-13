import { promises as fs } from "node:fs";

import type { TRating } from "@/types/library";

import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";
import {
  getImagesRootPathFromEnv,
  resolveImageFilePath,
  setRatingEntry,
} from "@/lib/image-library";

export const dynamic = "force-dynamic";

const parseRating = (body: unknown): TRating | null | undefined => {
  if (typeof body !== "object" || body === null || !("rating" in body)) {
    return undefined;
  }

  const { rating } = body;
  return rating === "ok" || rating === "good" || rating === null ? rating : undefined;
};

// Rates an image/video "ok" or "good" (body `{ "rating": "ok" | "good" }`), or clears its rating
// (`{ "rating": null }`). "Bad" is the Redraw action (PATCH /api/image), not a stored rating.
// Gated by SD_ALLOW_DELETE like the other marks. Ratings live in ratings.json (main root) and are
// laid over the library on each read, so no rescan is needed.
export const PUT = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  ensureLocalEnvLoaded();
  if (!readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY])) {
    return new Response("Rating is disabled", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = (searchParams.get("path") ?? "").trim().replaceAll("\\", "/");
  const filePath = requestedPath ? resolveImageFilePath(requestedPath) : null;
  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  const rating = parseRating(await request.json().catch(() => null));
  if (rating === undefined) {
    return new Response('Expected { "rating": "ok" | "good" | null }', { status: 400 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
  }

  // A rating is only ever added for a file that exists; clearing works either way.
  if (rating !== null) {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) {
      return new Response("Image not found", { status: 404 });
    }
  }

  await setRatingEntry(rootPath, requestedPath, rating);
  return new Response(null, { status: 204 });
};
