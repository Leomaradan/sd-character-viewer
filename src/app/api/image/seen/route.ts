import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { markImageAsSeen, resolveImageFilePath } from "@/lib/image-library";

export const dynamic = "force-dynamic";

// Marks an image/video as seen (dismissing its "new" badge and dropping it from the "show new
// only" filter) as soon as its Details view is opened, rather than waiting out the new-image time
// window. Unlike upscale/animate marks and delete/rename, this doesn't touch source media or
// require SD_ALLOW_DELETE - it's bookkeeping for a UI affordance, available to any authenticated
// viewer.
export const POST = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";
  const filePath = requestedPath ? resolveImageFilePath(requestedPath) : null;

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  await markImageAsSeen(requestedPath);
  return new Response(null, { status: 204 });
};
