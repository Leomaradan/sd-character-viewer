import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";
import {
  findAnimationNodeByKey,
  getImagesRootPathFromEnv,
  isVideoFilePath,
  readImageLibrary,
  readToAnimateEntries,
  readToExtendEntries,
  readToUpscaleEntries,
  readToUpscaleVideoEntries,
  readVideoLinks,
  removeToAnimateEntry,
  removeToExtendEntry,
  removeToUpscaleEntry,
  removeToUpscaleVideoEntry,
  resolveImageFilePath,
  setToAnimateEntry,
  setToExtendEntry,
  setToUpscaleEntry,
  setToUpscaleVideoEntry,
} from "@/lib/image-library";

export const dynamic = "force-dynamic";

// upscale/animate mark images; extend/upscaleVideo mark videos. A mark type used against the
// wrong media type (e.g. "animate" on a .mp4) is rejected rather than silently accepted.
const IMAGE_ONLY_MARK_TYPES = new Set(["upscale", "animate"]);
const VIDEO_ONLY_MARK_TYPES = new Set(["extend", "upscaleVideo"]);

const isMarkTypeMediaMismatch = (type: unknown, isVideo: boolean): boolean => {
  if (typeof type !== "string") {
    return false;
  }

  return isVideo ? IMAGE_ONLY_MARK_TYPES.has(type) : VIDEO_ONLY_MARK_TYPES.has(type);
};

const isMarkingAllowed = (): boolean => {
  ensureLocalEnvLoaded();
  return readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY]);
};

const normalizeRequestedPath = (rawPath: string): string => rawPath.trim().replaceAll("\\", "/");

export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = normalizeRequestedPath(searchParams.get("path") ?? "");
  const filePath = requestedPath ? resolveImageFilePath(requestedPath) : null;

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
  }

  if (isVideoFilePath(filePath)) {
    const [upscaleVideoEntries, extendEntries] = await Promise.all([
      readToUpscaleVideoEntries(rootPath),
      readToExtendEntries(rootPath),
    ]);

    const extendEntry = extendEntries[requestedPath];

    return Response.json({
      upscaleVideo: requestedPath in upscaleVideoEntries,
      extend: extendEntry ? { action: extendEntry.action } : null,
    });
  }

  const [upscaleEntries, animateEntries] = await Promise.all([
    readToUpscaleEntries(rootPath),
    readToAnimateEntries(rootPath),
  ]);

  const animateEntry = animateEntries[requestedPath];

  return Response.json({
    upscale: requestedPath in upscaleEntries,
    animate: animateEntry ? { action: animateEntry.action } : null,
  });
};

interface IMarkRequestBody {
  path?: unknown;
  type?: unknown;
  action?: unknown;
  metadata?: unknown;
}

// Shared by the animate and extend mark types: both key off a node in the (possibly nested)
// animations config, resolved by its stable `key` rather than display name.
const resolveAnimationAction = async (
  rawAction: unknown,
): Promise<{ action: string } | { error: Response }> => {
  const action = typeof rawAction === "string" ? rawAction.trim() : "";
  if (!action) {
    return { error: new Response("Invalid animation action", { status: 400 }) };
  }

  let library;
  try {
    library = await readImageLibrary();
  } catch {
    return { error: new Response("Could not read the image library", { status: 500 }) };
  }

  if (!findAnimationNodeByKey(library.animations, action)) {
    return { error: new Response("Unknown animation action", { status: 400 }) };
  }

  return { action };
};

const handleAnimateMark = async (
  rootPath: string,
  requestedPath: string,
  rawAction: unknown,
  metadata: string,
): Promise<Response> => {
  const resolved = await resolveAnimationAction(rawAction);
  if ("error" in resolved) {
    return resolved.error;
  }

  await setToAnimateEntry(rootPath, requestedPath, metadata, resolved.action);
  return new Response(null, { status: 204 });
};

// A video's metadata is never client-supplied (there's no PNG chunk to source it from for a
// .mp4) - it's always resolved server-side from video-links.json, carrying forward whatever
// metadata string the video's original source (image or video) was marked with. A video with no
// link yet (reconciliation hasn't matched it to a source) resolves to "".
const resolveVideoMetadata = async (rootPath: string, requestedPath: string): Promise<string> => {
  const videoLinks = await readVideoLinks(rootPath);
  return videoLinks[requestedPath]?.metadata ?? "";
};

const handleExtendMark = async (
  rootPath: string,
  requestedPath: string,
  rawAction: unknown,
): Promise<Response> => {
  const resolved = await resolveAnimationAction(rawAction);
  if ("error" in resolved) {
    return resolved.error;
  }

  const metadata = await resolveVideoMetadata(rootPath, requestedPath);
  await setToExtendEntry(rootPath, requestedPath, metadata, resolved.action);
  return new Response(null, { status: 204 });
};

export const PUT = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isMarkingAllowed()) {
    return new Response("Marking images is disabled", { status: 403 });
  }

  let body: IMarkRequestBody;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    body = (await request.json()) as IMarkRequestBody;
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const requestedPath = typeof body.path === "string" ? normalizeRequestedPath(body.path) : "";
  const metadata = typeof body.metadata === "string" ? body.metadata : "";
  const filePath = requestedPath ? resolveImageFilePath(requestedPath) : null;

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  const isVideo = isVideoFilePath(filePath);
  if (isMarkTypeMediaMismatch(body.type, isVideo)) {
    return new Response("Marking is not supported for this media type", { status: 400 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
  }

  if (body.type === "upscale") {
    await setToUpscaleEntry(rootPath, requestedPath, metadata);
    return new Response(null, { status: 204 });
  }

  if (body.type === "animate") {
    return handleAnimateMark(rootPath, requestedPath, body.action, metadata);
  }

  if (body.type === "upscaleVideo") {
    const upscaleVideoMetadata = await resolveVideoMetadata(rootPath, requestedPath);
    await setToUpscaleVideoEntry(rootPath, requestedPath, upscaleVideoMetadata);
    return new Response(null, { status: 204 });
  }

  if (body.type === "extend") {
    return handleExtendMark(rootPath, requestedPath, body.action);
  }

  return new Response("Invalid mark type", { status: 400 });
};

export const DELETE = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isMarkingAllowed()) {
    return new Response("Marking images is disabled", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = normalizeRequestedPath(searchParams.get("path") ?? "");
  const type = searchParams.get("type");
  const filePath = requestedPath ? resolveImageFilePath(requestedPath) : null;

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  const isVideo = isVideoFilePath(filePath);
  if (isMarkTypeMediaMismatch(type, isVideo)) {
    return new Response("Marking is not supported for this media type", { status: 400 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
  }

  if (type === "upscale") {
    await removeToUpscaleEntry(rootPath, requestedPath);
    return new Response(null, { status: 204 });
  }

  if (type === "animate") {
    await removeToAnimateEntry(rootPath, requestedPath);
    return new Response(null, { status: 204 });
  }

  if (type === "upscaleVideo") {
    await removeToUpscaleVideoEntry(rootPath, requestedPath);
    return new Response(null, { status: 204 });
  }

  if (type === "extend") {
    await removeToExtendEntry(rootPath, requestedPath);
    return new Response(null, { status: 204 });
  }

  return new Response("Invalid mark type", { status: 400 });
};
