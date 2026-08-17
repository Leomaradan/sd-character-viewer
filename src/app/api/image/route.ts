import { promises as fs } from "node:fs";
import path from "node:path";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import {
  resolveImageFilePath,
  resolvePreviewFilePath,
  removeFirstSeenCacheEntry,
} from "@/lib/image-library";
import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";

export const dynamic = "force-dynamic";

// Content rarely changes once generated, but files can still be overwritten in place
// (e.g. a pose regenerated under the same name), so cache freshness is validated against
// file size/mtime on every request rather than trusted for a fixed period.
// When password protection is enabled, responses must stay "private": a shared proxy/CDN
// does not vary its cache on the auth cookie, so "public" would let it replay one user's
// authenticated image response to a later unauthenticated (or different) requester.
const buildCacheControl = (): string => {
  const visibility = isPasswordProtectionEnabled() ? "private" : "public";
  return `${visibility}, max-age=86400, must-revalidate`;
};

const isDeleteAllowed = (): boolean => {
  ensureLocalEnvLoaded();
  return readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY]);
};

const buildEntityTag = (stat: { size: number; mtimeMs: number }): string => {
  return `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
};

const isNotModified = (request: Request, etag: string, lastModifiedMs: number): boolean => {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    return ifNoneMatch
      .split(",")
      .map((value) => value.trim())
      .includes(etag);
  }

  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince) {
    const ifModifiedSinceMs = Date.parse(ifModifiedSince);
    return Number.isFinite(ifModifiedSinceMs) && lastModifiedMs <= ifModifiedSinceMs;
  }

  return false;
};

const respondWithFile = async (
  request: Request,
  filePath: string,
  contentType: string,
): Promise<Response> => {
  const stat = await fs.stat(filePath);
  const lastModifiedMs = Math.floor(stat.mtimeMs / 1000) * 1000;
  const etag = buildEntityTag(stat);
  const cacheHeaders = {
    "Cache-Control": buildCacheControl(),
    ETag: etag,
    "Last-Modified": new Date(lastModifiedMs).toUTCString(),
  };

  if (isNotModified(request, etag, lastModifiedMs)) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  const fileBuffer = await fs.readFile(filePath);

  return new Response(fileBuffer, {
    status: 200,
    headers: { "Content-Type": contentType, ...cacheHeaders },
  });
};

export const GET = async (request: Request) => {
  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";
  const wantsPreview = searchParams.get("variant") === "preview";

  const filePath = resolveImageFilePath(requestedPath);

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  if (wantsPreview) {
    try {
      return await respondWithFile(request, resolvePreviewFilePath(filePath), "image/jpeg");
    } catch {
      // No preview generated yet for this image; fall back to the full-resolution PNG.
    }
  }

  try {
    return await respondWithFile(request, filePath, "image/png");
  } catch {
    return new Response("Image not found", { status: 404 });
  }
};

export const DELETE = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isDeleteAllowed()) {
    return new Response("Deleting images is disabled", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";

  const filePath = resolveImageFilePath(requestedPath);

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  try {
    await fs.unlink(filePath);
    await fs.unlink(resolvePreviewFilePath(filePath)).catch(() => {});
    invalidateMetadataCacheEntry(requestedPath);
    await removeFirstSeenCacheEntry(requestedPath);

    return new Response(null, { status: 204 });
  } catch {
    return new Response("Image not found", { status: 404 });
  }
};

const findNextAvailableNumber = async (
  directory: string,
  baseName: string,
  extension: string,
): Promise<number> => {
  const entries = await fs.readdir(directory);
  const pattern = new RegExp(
    `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)${extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  );

  let maxNumber = 1;
  for (const entry of entries) {
    const match = entry.match(pattern);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num >= maxNumber) {
        maxNumber = num + 1;
      }
    }
  }

  return maxNumber === 1 ? 2 : maxNumber;
};

export const PATCH = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isDeleteAllowed()) {
    return new Response("Renaming images is disabled", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";

  const filePath = resolveImageFilePath(requestedPath);

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  try {
    const directory = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName);
    const baseName = fileName.slice(0, Math.max(0, fileName.length - extension.length));

    const nextNumber = await findNextAvailableNumber(directory, baseName, extension);
    const newFileName = `${baseName} ${nextNumber}${extension}`;
    const newFilePath = path.join(directory, newFileName);

    await fs.rename(filePath, newFilePath);
    await fs
      .rename(resolvePreviewFilePath(filePath), resolvePreviewFilePath(newFilePath))
      .catch(() => {});

    const oldRelativePath = requestedPath;
    const newRelativePath =
      oldRelativePath.slice(0, Math.max(0, oldRelativePath.length - fileName.length)) + newFileName;

    invalidateMetadataCacheEntry(oldRelativePath);
    invalidateMetadataCacheEntry(newRelativePath);
    await removeFirstSeenCacheEntry(oldRelativePath);

    return Response.json({ newPath: newRelativePath }, { status: 200 });
  } catch {
    return new Response("Could not rename image", { status: 500 });
  }
};
