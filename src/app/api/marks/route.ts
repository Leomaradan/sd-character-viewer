import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";
import {
  getImagesRootPathFromEnv,
  readImageLibrary,
  readToAnimateEntries,
  readToUpscaleEntries,
  removeToAnimateEntry,
  removeToUpscaleEntry,
  resolveImageFilePath,
  setToAnimateEntry,
  setToUpscaleEntry,
} from "@/lib/image-library";

export const dynamic = "force-dynamic";

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

  if (!requestedPath || !resolveImageFilePath(requestedPath)) {
    return new Response("Invalid image path", { status: 400 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
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

const handleAnimateMark = async (
  rootPath: string,
  requestedPath: string,
  rawAction: unknown,
  metadata: string,
): Promise<Response> => {
  const action = typeof rawAction === "string" ? rawAction.trim() : "";
  if (!action) {
    return new Response("Invalid animation action", { status: 400 });
  }

  const library = await readImageLibrary();
  if (!library.animations.includes(action)) {
    return new Response("Unknown animation action", { status: 400 });
  }

  await setToAnimateEntry(rootPath, requestedPath, metadata, action);
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

  if (!requestedPath || !resolveImageFilePath(requestedPath)) {
    return new Response("Invalid image path", { status: 400 });
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

  if (!requestedPath || !resolveImageFilePath(requestedPath)) {
    return new Response("Invalid image path", { status: 400 });
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

  return new Response("Invalid mark type", { status: 400 });
};
