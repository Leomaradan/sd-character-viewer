import { promises as fs } from "node:fs";
import { resolveImageFilePath } from "@/lib/image-library";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path")?.trim() ?? "";

  const filePath = resolveImageFilePath(requestedPath);

  if (!filePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  try {
    const fileBuffer = await fs.readFile(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Image not found", { status: 404 });
  }
};
