import { readImageLibrary } from "@/lib/image-library";

export const dynamic = "force-dynamic";

export async function GET() {
  const library = await readImageLibrary();
  return Response.json(library);
}
