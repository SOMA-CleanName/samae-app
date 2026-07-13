import { NextResponse } from "next/server";
import { sendDigest, type DigestRange } from "@/lib/ops-digest";

// 데일리 리포트 크론 — 매일 09:00 KST(= 00:00 UTC)에 Vercel Cron 이 GET 으로 호출.
// 보호: CRON_SECRET 이 설정돼 있으면 Vercel 이 자동으로 실어주는
//   Authorization: Bearer <CRON_SECRET> 헤더를 검증한다(무단 호출로 디스코드 스팸 방지).
//   프로덕션에선 반드시 CRON_SECRET 을 설정할 것.
// 수동/테스트: ?range=today 로 오늘(현재까지) 요약을 즉시 전송.

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

  const range: DigestRange =
    new URL(request.url).searchParams.get("range") === "today" ? "today" : "yesterday";

  const result = await sendDigest(range);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
