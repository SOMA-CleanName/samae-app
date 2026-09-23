import { getCurrentUser } from "@/lib/auth";
import { guideCardResponse } from "@/lib/guide-card-route";

export const runtime = "nodejs";

// 작가 본인용. **pid 를 받지 않는다** — 세션의 작가 행에서 꺼낸다.
// 쿼리로 받으면 남의 id 를 넣어 다른 작가 KB 를 그려 볼 수 있다.
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me?.photographer) return new Response("forbidden", { status: 403 });

  const { searchParams } = new URL(request.url);
  return guideCardResponse(me.photographer.id, searchParams);
}
