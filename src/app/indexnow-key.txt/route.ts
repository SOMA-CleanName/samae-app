import { INDEXNOW_KEY } from "@/lib/indexnow";

/*
  IndexNow 키 확인용 주소.

  검색엔진은 우리가 보낸 요청의 `key` 와 여기 내용이 같은지 대조해서, 그 호스트를
  제어하는 사람이 보낸 요청인지 확인한다. 키 자체는 비밀이 아니다(규격상 공개된다).

  파일(`public/<key>.txt`)이 아니라 라우트인 이유 — 파일명과 env 값이 어긋나는 순간
  **아무 에러 없이** 요청이 무시된다. 라우트는 같은 env 를 읽으니 어긋날 수가 없다.
*/
export const dynamic = "force-dynamic";

export function GET() {
  if (!INDEXNOW_KEY) return new Response("Not Found", { status: 404 });
  return new Response(INDEXNOW_KEY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
