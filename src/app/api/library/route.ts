import { promisify } from "node:util";
import { gzip } from "node:zlib";

import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { readImageLibrary } from "@/lib/image-library";

export const dynamic = "force-dynamic";

const gzipAsync = promisify(gzip);

const acceptsGzip = (request: Request): boolean =>
  (request.headers.get("accept-encoding") ?? "")
    .split(",")
    .some((encoding) => encoding.trim().split(";")[0]?.trim().toLowerCase() === "gzip");

export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const library = await readImageLibrary();
  const body = JSON.stringify(library);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Accept-Encoding",
  };

  // A big library is a few MB of JSON; Next.js doesn't compress route handler responses, and it
  // shrinks ~10x - which matters when the app is reached over a slow link (NAS, VPN).
  if (acceptsGzip(request)) {
    return new Response(new Uint8Array(await gzipAsync(body)), {
      headers: { ...headers, "Content-Encoding": "gzip" },
    });
  }

  return new Response(body, { headers });
};
