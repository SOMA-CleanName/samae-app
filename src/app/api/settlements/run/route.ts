import { runDueSettlements } from "@/lib/payments";

export const runtime = "nodejs";

// ── 정산 확정 배치 : scheduled & 도래(scheduled_at<=now) → paid ───────
// cron/운영자 호출. x-cron-secret 헤더로 보호 (실서비스는 cron 스케줄러가 호출).
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.SETTLEMENT_CRON_SECRET || secret !== process.env.SETTLEMENT_CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const count = await runDueSettlements(new Date().toISOString());
  return Response.json({ ok: true, settled: count });
}
