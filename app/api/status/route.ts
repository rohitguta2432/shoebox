import { modelStatus } from "@/lib/extract";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await modelStatus());
}
