import path from "node:path";

import type { ILibraryData } from "@/types/library";

import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";
import {
  getImagesRootPathFromEnv,
  isVideoFilePath,
  MediaRenameError,
  readCustomPoseEntries,
  readImageLibrary,
  renameMediaFile,
  resolveImageFilePath,
  setCustomPoseEntry,
} from "@/lib/image-library";
import { buildConformedStem, isPoseConforming } from "@/lib/pose-conformity";

export const dynamic = "force-dynamic";

const MEDIA_RENAME_ERROR_STATUS: Record<MediaRenameError["code"], number> = {
  "invalid-path": 400,
  "invalid-name": 400,
  "not-found": 404,
  conflict: 409,
};

const isPoseConformityManagementAllowed = (): boolean => {
  ensureLocalEnvLoaded();
  return readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY]);
};

// Lists the images/videos whose pose isn't one of config.json's standard "poses" (see
// isPoseConforming), minus the ones already marked as a custom pose.
export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const library = await readImageLibrary();

  if (!library.rootConfigured || !library.rootPath || library.standardPoses.length === 0) {
    return Response.json({ standardPoses: library.standardPoses, items: [] });
  }

  const customPoseEntries = await readCustomPoseEntries(library.rootPath);
  const items = library.images.filter(
    (image) =>
      !(image.relativePath in customPoseEntries) && !isPoseConforming(image, library.standardPoses),
  );

  return Response.json({ standardPoses: library.standardPoses, items });
};

interface IPoseConformityRequestBody {
  path?: unknown;
  pose?: unknown;
  custom?: unknown;
}

const readRequestBody = async (request: Request): Promise<IPoseConformityRequestBody | null> => {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null ? body : null;
  } catch {
    return null;
  }
};

const conformToPose = async (
  library: ILibraryData,
  relativePath: string,
  pose: string,
): Promise<Response> => {
  const standardPose = library.standardPoses.find(
    (candidate) => candidate.toLowerCase() === pose.trim().toLowerCase(),
  );

  if (!standardPose) {
    return new Response("Unknown pose", { status: 400 });
  }

  const fileName = path.posix.basename(relativePath);
  const rawStem = fileName.slice(0, fileName.length - path.posix.extname(fileName).length);
  const newStem = buildConformedStem(
    rawStem,
    isVideoFilePath(fileName) ? "video" : "image",
    standardPose,
  );

  try {
    const newRelativePath = await renameMediaFile(relativePath, newStem, {
      incrementOnConflict: true,
    });
    invalidateMetadataCacheEntry(relativePath);
    invalidateMetadataCacheEntry(newRelativePath);
    return Response.json({ newPath: newRelativePath }, { status: 200 });
  } catch (error) {
    if (error instanceof MediaRenameError) {
      return new Response(error.message, { status: MEDIA_RENAME_ERROR_STATUS[error.code] });
    }
    return new Response("Could not rename the file", { status: 500 });
  }
};

// `{ path, pose }` renames the file to that standard pose (numbered when the name is taken);
// `{ path, custom: true }` marks it as a deliberate custom pose so it's no longer listed.
export const POST = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isPoseConformityManagementAllowed()) {
    return new Response("Managing poses is disabled", { status: 403 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
  }

  const body = await readRequestBody(request);
  const relativePath = typeof body?.path === "string" ? body.path.trim() : "";

  if (!relativePath || !resolveImageFilePath(relativePath)) {
    return new Response("Invalid image path", { status: 400 });
  }

  // Only the exact relativePath the library lists is accepted: marks and renames are keyed by
  // it, so an alias that resolves to the same file ("./", in-tree "..", "extra-roots/00/...")
  // would be stored under a key GET never matches.
  const library = await readImageLibrary();
  if (!library.images.some((image) => image.relativePath === relativePath)) {
    return new Response("Invalid image path", { status: 400 });
  }

  if (body?.custom === true) {
    await setCustomPoseEntry(rootPath, relativePath);
    return new Response(null, { status: 204 });
  }

  if (typeof body?.pose !== "string" || body.pose.trim() === "") {
    return new Response("Invalid pose request", { status: 400 });
  }

  return conformToPose(library, relativePath, body.pose);
};
