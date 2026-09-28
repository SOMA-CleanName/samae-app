import { NextResponse } from "next/server";

import { parseImageDataUrl } from "@/lib/image-search-core";
import { searchPhotosByImage } from "@/lib/image-search";

// 사진으로 검색 — 브라우저가 줄인 사진 한 장을 받아 비슷한 사진을 돌려준다. (docs/46 §3)
//
// 사진은 저장하지 않는다. 벡터로 바꾸는 데만 쓰고 버린다.
// 로그인은 요구하지 않는다(글 검색과 같다). 대신 맥미니가 사람 한 명에게 끌려가지 않게 IP 로 막는다.
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // service_role 키로 사진을 읽는다

/** 한 IP 가 1분에 부를 수 있는 횟수. 사진 한 장당 맥미니 추론이 한 번이다. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
// 서버 인스턴스마다 따로 센다(Vercel 은 서버가 여러 대다). 완벽한 방어가 아니라
// 한 사람이 탭을 열어두고 계속 부르는 것을 막는 턱이다.
const recent = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5_000) recent.clear();   // 메모리가 무한정 늘지 않게
  return hits.length > RATE_LIMIT;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) {
    return NextResponse.json({ error: "too-many" }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const image = parseImageDataUrl((payload as { image?: unknown } | null)?.image);
  if (!image) {
    // 형식이 아니거나 너무 크다 — 브라우저가 줄이기에 실패한 경우(HEIC 등)도 여기로 온다
    return NextResponse.json({ error: "bad-image" }, { status: 400 });
  }

  const result = await searchPhotosByImage(image.base64);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }
  return NextResponse.json({ photos: result.photos, capped: result.capped });
}
