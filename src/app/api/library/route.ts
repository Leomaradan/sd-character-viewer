import { readImageLibrary } from "@/lib/image-library";

export const dynamic = "force-dynamic";

export const GET = async () => {
  const library = await readImageLibrary();
  return Response.json(library);
};
