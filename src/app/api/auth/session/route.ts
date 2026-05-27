import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  const required = isPasswordProtectionEnabled();
  const authenticated = required ? isAuthenticatedRequest(request) : true;

  return Response.json({ misconfigured: false, required, authenticated });
};
