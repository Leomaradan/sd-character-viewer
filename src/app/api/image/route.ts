import { promises as fs } from "node:fs";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { resolveImageFilePath } from "@/lib/image-library";
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

    return new Response(null, { status: 204 });
  } catch {
    return new Response("Image not found", { status: 404 });
  }
};
