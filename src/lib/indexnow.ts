import "server-only";

/*
  IndexNow — **새 글이 올라온 걸 검색엔진에 즉시 알린다.**

  구글은 sitemap 의 `lastmod` 를 보고 알아서 다시 온다. 문제는 네이버다 —
  robots.txt 의 `Sitemap:` 줄만 보고 긁지 않고, 재방문 주기도 훨씬 느리다. 새 작가나
  아티클이 검색에 잡히기까지 몇 주가 걸린다는 뜻이다.

  IndexNow 는 그걸 푸는 표준이다. 네이버가 2023-07-25 부터 지원하고, Bing·Yandex·Seznam
  도 같은 엔드포인트를 쓴다. **구글은 지원하지 않는다** — 구글 몫은 sitemap 의 lastmod 다.

  ⚠️ 이건 "요청" 이지 보장이 아니다. 색인 여부는 검색엔진이 정한다.

  ── 왜 발행 시점이 아니라 크론인가 ──────────────────────────────
  발행하는 자리가 한둘이 아니다 — 아티클·가이드·장소 공개, 작가 승인, 패키지 수정,
  포트폴리오 업로드… 거기 하나씩 붙이면 **새로 생기는 자리를 반드시 빠뜨린다.**
  대신 하루 한 번 sitemap 을 읽어 **최근에 바뀐 URL** 만 보낸다. sitemap 은 이미
  모든 지면을 알고 lastmod 를 들고 있으니, 앞으로 지면이 늘어도 자동으로 따라온다.

  상태를 저장하지 않는다. "지난 하루 안에 바뀐 것" 이 곧 보낼 목록이라 스냅샷 테이블이
  필요 없다. 크론이 하루 거르면 그날 것은 놓치지만, sitemap 에는 그대로 남아 있어
  구글은 어차피 가져가고 네이버도 다음 주기에 본다.
*/

import { SITE_URL } from "@/lib/site";
// 순수 함수라 떼어 뒀다 — 여기는 server-only 라 테스트에서 못 부른다
import { recentUrlsFromSitemap } from "@/lib/indexnow-window";

/*
  키는 16진수 문자와 `-` 만 쓸 수 있다(IndexNow 규격).

  ⚠️ 규격상 키를 사이트 어딘가에 평문으로 올려 두고 그 주소를 `keyLocation` 으로 알려야
     한다 — **이건 비밀이 아니다.** "이 호스트를 제어하는 사람이 보낸 요청" 임을 증명하는
     용도뿐이다.

  파일(`public/<key>.txt`)로 두지 않고 라우트로 서빙한다. 파일로 두면 파일명과 env 값이
  **따로 노는 순간 조용히 깨진다**(검색엔진이 키를 대조하지 못해 요청이 무시된다).
  라우트는 같은 env 를 읽으니 어긋날 수가 없다. → app/indexnow-key.txt/route.ts
*/
export const INDEXNOW_KEY = process.env.INDEXNOW_KEY?.trim() ?? "";

const ENDPOINT = "https://api.indexnow.org/IndexNow";
/** 키를 서빙하는 주소. app/indexnow-key.txt/route.ts 와 같아야 한다 */
export const KEY_LOCATION = `${SITE_URL}/indexnow-key.txt`;

type Result = { ok: boolean; sent: number; status?: number; skipped?: string };

/**
 * 최근 바뀐 URL 을 IndexNow 에 알린다.
 *
 * 키가 없으면 아무 일도 하지 않는다(실패가 아니다) — 키는 선택 설정이고,
 * 없다고 크론 전체를 500 으로 떨어뜨릴 이유가 없다.
 */
export async function pingIndexNow(now = new Date()): Promise<Result> {
  if (!INDEXNOW_KEY) return { ok: true, sent: 0, skipped: "INDEXNOW_KEY 미설정" };

  const res = await fetch(`${SITE_URL}/sitemap.xml`, { cache: "no-store" });
  if (!res.ok) return { ok: false, sent: 0, status: res.status, skipped: "sitemap 조회 실패" };

  const urlList = recentUrlsFromSitemap(await res.text(), now);
  if (urlList.length === 0) return { ok: true, sent: 0, skipped: "바뀐 URL 없음" };

  const host = new URL(SITE_URL).host;
  const ping = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    }),
  });

  // 200/202 가 정상. 4xx 는 키·호스트 문제라 조용히 넘기면 안 된다.
  return { ok: ping.ok, sent: urlList.length, status: ping.status };
}
