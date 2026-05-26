import { readImageLibrary } from "@/lib/image-library";
import { isAuthenticatedRequest, isPasswordProtectionEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const library = await readImageLibrary();
  return Response.json(library);
};
