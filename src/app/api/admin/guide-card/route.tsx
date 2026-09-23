import { getCurrentUser } from "@/lib/auth";
import { guideCardResponse } from "@/lib/guide-card-route";

export const runtime = "nodejs";

// 작가 촬영 정보 안내 카드 — 운영자용. 아무 작가의 것이나 그릴 수 있다.
// KB 는 service_role 로 읽으므로 공개하면 남의 작가 KB 가 통째로 덤프된다.
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return new Response("forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get("pid") ?? "";
  if (!pid) return new Response("pid required", { status: 400 });

  return guideCardResponse(pid, searchParams);
}
