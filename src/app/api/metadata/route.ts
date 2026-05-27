import { promises as fs } from "node:fs";
import { decode } from "png-chunk-text";
import extractChunks from "png-chunks-extract";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { resolveImageFilePath } from "@/lib/image-library";

export const dynamic = "force-dynamic";

// ---------- server-side TTL cache ----------

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // sweep at most once per hour

interface ICacheEntry {
  data: Record<string, string>;
  cachedAt: number;
}

const cache = new Map<string, ICacheEntry>();
let lastSweepAt = 0;

export const invalidateMetadataCacheEntry = (requestedPath: string): void => {
  cache.delete(requestedPath);
};

function sweepExpiredEntries(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) {
    return;
  }
  lastSweepAt = now;
  for (const [key, entry] of cache.entries()) {
    if (now - entry.cachedAt >= CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

// ---------- route handler ----------

export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";

  const filePath = resolveImageFilePath(requestedPath);
  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  sweepExpiredEntries();

  const cached = cache.get(requestedPath);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return Response.json(cached.data);
  }

  try {
    const buffer = await fs.readFile(filePath);
    const chunks = extractChunks(new Uint8Array(buffer));

    const metadata: Record<string, string> = {};
    for (const chunk of chunks) {
      if (chunk.name === "tEXt") {
        const { keyword, text } = decode(chunk.data);
        metadata[keyword] = text;
      }
    }

    cache.set(requestedPath, { data: metadata, cachedAt: Date.now() });

    return Response.json(metadata);
  } catch {
    return new Response("Could not read image metadata", { status: 404 });
  }
};
