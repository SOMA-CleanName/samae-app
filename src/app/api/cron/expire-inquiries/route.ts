import { NextResponse } from "next/server";
import { expireStaleInquiries } from "@/lib/inquiry-expiry";

// 문의 만료 크론 — 매일 09:30 KST(= 00:30 UTC)에 Vercel Cron 이 GET 으로 호출.
// 접수(new) 후 7일 지나도록 작가가 해제하지 않은 문의를 expired 로 전이한다.
// 보호: daily-digest 와 동일하게 CRON_SECRET 이 설정돼 있으면
//   Authorization: Bearer <CRON_SECRET> 헤더를 검증(무단 호출 방지).
// 수동/테스트: 같은 헤더로 GET 하면 즉시 스윕(멱등).

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키 필요

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await expireStaleInquiries();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
