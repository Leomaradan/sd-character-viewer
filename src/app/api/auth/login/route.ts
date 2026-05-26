import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  AUTH_COOKIE_NAME,
  createAuthCookieValue,
  isPasswordProtectionEnabled,
  validatePassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ILoginBody {
  password?: string;
}

const buildSetCookieHeader = (cookieValue: string, secure: boolean): string => {
  const secureDirective = secure ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}${secureDirective}`;
};

export const POST = async (request: Request) => {
  const protectionEnabled = isPasswordProtectionEnabled();

  if (!protectionEnabled) {
    return Response.json({ authenticated: true, required: false });
  }

  let parsedBody: ILoginBody;

  try {
    parsedBody = (await request.json()) as ILoginBody;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const password = parsedBody.password?.trim() ?? "";

  if (!password || !validatePassword(password)) {
    return new Response("Invalid password", { status: 401 });
  }

  const cookieValue = createAuthCookieValue();
  if (!cookieValue) {
    return Response.json({ authenticated: true, required: false });
  }

  const secure = new URL(request.url).protocol === "https:";

  return new Response(JSON.stringify({ authenticated: true, required: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSetCookieHeader(cookieValue, secure),
    },
  });
};
