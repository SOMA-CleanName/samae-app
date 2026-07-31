import { NextResponse } from "next/server";
import { sendCapiQuoteLead } from "@/lib/meta-capi";

// '무료로 견적 받아보기' 클릭 전환의 서버측 보완(CAPI) 수신 — 클라(meta-lead.ts)가
// 픽셀 발화 직후 sendBeacon 으로 호출한다. 같은 eventID 라 Meta 가 픽셀과 중복 제거.
// 중복 클릭 방어는 클라 localStorage 가드가 담당 — 여기선 형식 검증만 한다.

const EVENT_ID_RE = /^quote_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request) {
  let eventID = "";
  try {
    const body = (await req.json()) as { eventID?: unknown };
    eventID = typeof body.eventID === "string" ? body.eventID : "";
  } catch {
    /* 본문 파싱 실패 → 아래 형식 검증에서 걸러짐 */
  }
  if (!EVENT_ID_RE.test(eventID)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await sendCapiQuoteLead(eventID);
  return NextResponse.json({ ok: true });
}
