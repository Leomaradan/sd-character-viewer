import { promises as fs } from "node:fs";
import path from "node:path";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { resolveImageFilePath, removeFirstSeenCacheEntry } from "@/lib/image-library";
import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";

export const dynamic = "force-dynamic";

const isDeleteAllowed = (): boolean => {
  ensureLocalEnvLoaded();
  return readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY]);
};

export const GET = async (request: Request) => {
  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";

  const filePath = resolveImageFilePath(requestedPath);

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  try {
    const fileBuffer = await fs.readFile(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
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
