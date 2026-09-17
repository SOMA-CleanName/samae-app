// sitemap 에서 "최근에 바뀐 URL" 만 골라내는 순수 함수.
//
// indexnow.ts 에 두면 테스트에서 못 부른다 — 거기는 "server-only" 라 node 테스트
// 러너에서 터진다 (guide-slug·image-thumb 를 떼어낸 것과 같은 이유).

/** 이 시간 안에 바뀐 것만 보낸다 — 크론이 하루 한 번이라 여유를 둔다 */
export const WINDOW_HOURS = 25;
/** IndexNow 한 요청의 상한. 하루치라 근처에 갈 일은 없다 */
export const MAX_URLS = 10_000;

/**
 * sitemap.xml 에서 `<loc>` + `<lastmod>` 를 뽑아 최근 것만 돌려준다.
 *
 * ⚠️ **lastmod 가 없는 항목은 보내지 않는다.** 바뀌었는지 알 수 없는 걸 매일 보내면
 *    그냥 소음이고, 검색엔진이 요청 자체를 덜 믿게 된다. 정적 지면이 여기 해당한다.
 */
export function recentUrlsFromSitemap(
  xml: string,
  now: Date = new Date(),
  windowHours: number = WINDOW_HOURS
): string[] {
  const cutoff = now.getTime() - windowHours * 60 * 60 * 1000;
  const out: string[] = [];
  for (const block of xml.split("<url>").slice(1)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1];
    const mod = /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1];
    if (!loc || !mod) continue;
    const t = Date.parse(mod);
    if (Number.isNaN(t) || t < cutoff) continue;
    out.push(loc);
  }
  return out.slice(0, MAX_URLS);
}
