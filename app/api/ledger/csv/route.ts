import { registerCsv } from "@/lib/ledger";
import { loadLedger } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await loadLedger();
  const today = new Date().toISOString().slice(0, 10);
  return new Response(registerCsv(entries), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="purchase-register-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
