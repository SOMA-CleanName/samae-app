import { applyPaymentPaid } from "@/lib/payments";
import { verifySignature, PG_SIGNATURE_HEADER, type PgWebhookEvent } from "@/lib/pg-mock";

export const runtime = "nodejs";

// ── PG 결제 webhook (신뢰의 원천) ───────────────────────────────────
// 서명 검증 → 금액 대조·멱등은 applyPaymentPaid 내부에서. 클라이언트 콜백은 UX용.
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get(PG_SIGNATURE_HEADER);
  if (!verifySignature(raw, sig)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: PgWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }
  if (event.status !== "paid") {
    return Response.json({ ok: true, ignored: event.status });
  }

  const result = await applyPaymentPaid(event);
  if (!result.ok) {
    // amount_mismatch / not_found / bad_state — 재시도해도 동일하므로 4xx
    return Response.json({ error: result.reason }, { status: 422 });
  }
  return Response.json({ ok: true, idempotent: result.idempotent });
}
