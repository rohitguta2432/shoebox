import { readPhoto } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const photo = await readPhoto(id);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" },
  });
}
