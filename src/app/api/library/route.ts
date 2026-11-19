import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { readImageLibrary } from "@/lib/image-library";

export const dynamic = "force-dynamic";

// Compression is left to Next.js (`compress`, on by default), which gzips route handler responses
// itself. Gzipping here too double-encodes the body and breaks the client's JSON parsing.
export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json(await readImageLibrary());
};
