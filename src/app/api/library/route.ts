import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { readImageLibrary } from "@/lib/image-library";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const library = await readImageLibrary();
  return Response.json(library);
};
