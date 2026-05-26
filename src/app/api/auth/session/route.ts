import { isAuthenticatedRequest, isPasswordProtectionEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const required = isPasswordProtectionEnabled();
  const authenticated = required ? isAuthenticatedRequest(request) : true;

  return Response.json({
    required,
    authenticated,
  });
};
