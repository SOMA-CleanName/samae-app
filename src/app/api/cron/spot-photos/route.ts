import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { recomputeSpotPhotos } from "@/lib/spot-photos";

// 촬영 장소 ↔ 사진 자동 연결 — **신규 사진만** 더한다(spot_photos, 0145).
//
// ⚠️ **vercel.json 에 걸려 있지 않다.** 맥미니 06:00 배치(scripts/embed/run-embed.sh, docs/28)가
//    임베딩 · 검색 목록을 만든 뒤 마지막 단계로 이걸 부른다. 매칭 규칙이 앱(lib/spots)에 있어서
//    파이썬으로 다시 짜지 않고 여기를 부른다 — 규칙을 두 벌 두면 어긋난다.
//
// 전체 다시 계산(나중에 장소 메모를 단 사진 같은 예외)은 어드민 버튼으로만 한다(/admin/spots/photos).
//
// 보호: 다른 크론과 같이 CRON_SECRET 이 있으면 Bearer 검증. 멱등 — 이미 연결된 사진은 건너뛴다.
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키 필요

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await recomputeSpotPhotos({ newOnly: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
