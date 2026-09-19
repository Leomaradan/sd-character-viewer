import { createReadStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";
import {
  getImagesRootPathFromEnv,
  isVideoFilePath,
  migrateVideoLink,
  removeFirstSeenCacheEntry,
  removeLibraryIndexCache,
  removeMarkedActionEntries,
  resolveImageFilePath,
  resolvePreviewFilePath,
  setToAnimateEntry,
  setToExtendEntry,
} from "@/lib/image-library";

const getContentTypeForFilePath = (filePath: string): string => {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".mp4":
      return "video/mp4";
    default:
      return "image/png";
  }
};

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

// Parses a single "bytes=start-end" Range header (the only form browsers send for <video>
// seeking/preload). Returns null for anything absent, malformed, or unsatisfiable, which callers
// treat as "serve the whole file".
const parseRange = (
  rangeHeader: string | null,
  fileSize: number,
): { start: number; end: number } | null => {
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : fileSize - Number.parseInt(match[2], 10);
  const end = match[1] && match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    end >= fileSize
  ) {
    return null;
  }

  return { start, end };
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
    "Accept-Ranges": "bytes",
  };

  if (isNotModified(request, etag, lastModifiedMs)) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  const range = parseRange(request.headers.get("range"), stat.size);

  if (range) {
    const stream = createReadStream(filePath, { start: range.start, end: range.end });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Content-Length": String(range.end - range.start + 1),
        ...cacheHeaders,
      },
    });
  }

  const fileBuffer = await fs.readFile(filePath);

  return new Response(fileBuffer, {
    status: 200,
    headers: { "Content-Type": contentType, "Content-Length": String(stat.size), ...cacheHeaders },
  });
};

// Unlike images (which fall back to the original file when no preview exists), a video with no
// manually provided ".preview.png" sidecar must 404 rather than serve the raw .mp4 bytes as a
// "preview": the frontend relies on this 404 (via a plain <img>'s onError) to know it should
// render a native <video> thumbnail instead.
const tryRespondWithPreview = async (
  request: Request,
  filePath: string,
  isVideo: boolean,
): Promise<Response | null> => {
  const previewFilePath = resolvePreviewFilePath(filePath);

  if (existsSync(previewFilePath)) {
    try {
      return await respondWithFile(
        request,
        previewFilePath,
        getContentTypeForFilePath(previewFilePath),
      );
    } catch (error) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        return new Response("Could not read preview image", { status: 500 });
      }
    }
  }

  return isVideo ? new Response("Preview not found", { status: 404 }) : null;
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

  const isVideo = isVideoFilePath(filePath);

  if (wantsPreview) {
    const previewResponse = await tryRespondWithPreview(request, filePath, isVideo);
    if (previewResponse) {
      return previewResponse;
    }
  }

  try {
    return await respondWithFile(request, filePath, getContentTypeForFilePath(filePath));
  } catch {
    return new Response(isVideo ? "Video not found" : "Image not found", { status: 404 });
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
    await removeMarkedActionEntries(requestedPath);
    await removeLibraryIndexCache();

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
  const replaceToken = String.raw`\$&`;
  const pattern = new RegExp(
    String.raw`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, replaceToken)}\s+(\d+)${extension.replace(/[.*+?^${}()|[\]\\]/g, replaceToken)}$`,
  );

  let maxNumber = 1;
  for (const entry of entries) {
    const match = new RegExp(pattern).exec(entry);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num >= maxNumber) {
        maxNumber = num + 1;
      }
    }
  }

  return maxNumber === 1 ? 2 : maxNumber;
};

// Redraw-on-video: renaming a linked video frees its old name (same non-destructive semantics as
// Redraw-on-image) and re-requests the same generation - same source, action, and prompt - by
// requeuing a mark in whichever file matches the link's sourceMediaType. Best-effort: any failure
// here (no link found, or a write error) must never fail the rename itself, which has already
// succeeded on disk by the time this runs.
const requeueVideoLinkMark = async (
  oldRelativePath: string,
  newRelativePath: string,
): Promise<boolean> => {
  try {
    const rootPath = getImagesRootPathFromEnv();
    if (!rootPath) {
      return false;
    }

    const link = await migrateVideoLink(rootPath, oldRelativePath, newRelativePath);
    if (!link) {
      return false;
    }

    if (link.sourceMediaType === "image") {
      await setToAnimateEntry(
        rootPath,
        link.sourceRelativePath,
        link.metadata,
        link.action,
        link.prompt,
      );
    } else {
      await setToExtendEntry(
        rootPath,
        link.sourceRelativePath,
        link.metadata,
        link.action,
        link.prompt,
      );
    }

    return true;
  } catch {
    return false;
  }
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
    await removeMarkedActionEntries(oldRelativePath);
    await removeLibraryIndexCache();

    const requeued = isVideoFilePath(filePath)
      ? await requeueVideoLinkMark(oldRelativePath, newRelativePath)
      : false;

    return Response.json({ newPath: newRelativePath, requeued }, { status: 200 });
  } catch {
    return new Response("Could not rename image", { status: 500 });
  }
};
