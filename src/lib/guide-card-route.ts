// 안내 이미지 PNG 를 그려 주는 공통 알맹이 — 운영(/api/admin/guide-card)과
// 작가(/api/studio/guide-card)가 **같은 그림**을 봐야 해서 한 곳에 둔다.
// 다른 것은 누구인지 확인하는 방법과 어느 작가의 것을 그리느냐뿐이라, 라우트가 그것만 맡는다.
//
//   ?sheet 없음        → 몇 장이 나오는지 목록(JSON)
//   ?sheet=1           → 그 장의 PNG (1-based)
//   &template=&backdrop=&font=&backdropUrl=  → 저장 전 미리보기 덮어쓰기

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPhotographerKb } from "@/lib/bot-kb-db";
import {
  renderGuideCardFitted,
  fittedHeight,
  groupCardsIntoSheets,
  type GuideSheet,
} from "@/lib/guide-card-template";
import { resolveGuideStyle, type GuideStyle } from "@/lib/guide-style";

/**
 * 세트 공통 높이 캐시.
 *
 * ⚠️ **값이 아니라 약속(Promise)을 담는다.** 양식을 바꾸면 그 세트의 모든 장이 거의 동시에
 * 요청으로 들어온다. 값만 캐싱하면 전부 아직 비어 있는 캐시를 보고 **각자** 세트 전체를
 * 재기 시작한다 — 7장이면 7×(7×2)+7 = 105번을 굽는다. 약속을 담아 두면 첫 요청만 재고
 * 나머지는 그 약속을 기다린다: 7×2+7 = 21번.
 *
 * 어드민·작가 한 명이 조합을 고르는 동안만 사는 값이라 메모리에 둔다.
 */
const heightCache = new Map<string, Promise<number>>();

function styleKey(pid: string, style: GuideStyle): string {
  return [pid, style.template, style.backdrop, style.font, style.backdropUrl ?? ""].join("|");
}

function uniformHeight(
  pid: string,
  displayName: string,
  sheets: GuideSheet[],
  style: GuideStyle
): Promise<number> {
  const key = styleKey(pid, style);
  const hit = heightCache.get(key);
  if (hit) return hit;

  const p = Promise.all(sheets.map((s) => fittedHeight(displayName, s, style))).then((hs) =>
    Math.max(...hs)
  );
  // 실패한 약속을 남겨 두면 그 조합은 영영 안 된다 — 지우고 다음 요청이 다시 재게 한다
  p.catch(() => heightCache.delete(key));
  // 조합을 계속 바꿔 보므로 무한정 쌓이지 않게 상한을 둔다
  if (heightCache.size > 40) heightCache.clear();
  heightCache.set(key, p);
  return p;
}

export async function guideCardResponse(pid: string, searchParams: URLSearchParams): Promise<Response> {
  const admin = createAdminClient();
  const { data: photographer } = await admin
    .from("photographers")
    .select("display_name, guide_style")
    .eq("id", pid)
    .maybeSingle();
  if (!photographer) return new Response("photographer not found", { status: 404 });

  const displayName = photographer.display_name ?? "";
  const kb = await fetchPhotographerKb(pid, displayName);
  const sheets = groupCardsIntoSheets(kb?.cards ?? []);

  // sheet 없이 부르면 목록 — 몇 장을 받아가야 하는지 먼저 보고 훑는 용도
  const sheetParam = searchParams.get("sheet");
  if (!sheetParam) {
    return Response.json({
      photographer: displayName,
      sheets: sheets.map((s, i) => ({ sheet: i + 1, label: s.label, cards: s.cards.length })),
    });
  }

  const index = Number(sheetParam);
  const sheet = Number.isInteger(index) ? sheets[index - 1] : undefined;
  if (!sheet) return new Response("sheet out of range", { status: 404 });

  // 쿼리에 실린 값이 있으면 그것으로 — 저장 전 미리보기
  const override = {
    template: searchParams.get("template") ?? undefined,
    backdrop: searchParams.get("backdrop") ?? undefined,
    font: searchParams.get("font") ?? undefined,
    backdropUrl: searchParams.get("backdropUrl") ?? undefined,
  };
  const hasOverride = Object.values(override).some((v) => v !== undefined);
  const style = hasOverride
    ? resolveGuideStyle({ ...resolveGuideStyle(photographer.guide_style), ...override })
    : resolveGuideStyle(photographer.guide_style);

  // 발행과 같은 재단·크기 맞추기를 거친다 — 미리보기와 결과가 다르면 미리볼 이유가 없다.
  // 공통 높이는 세트 전체를 재야 나오는데 한 장씩 요청이 들어오므로 한 번만 재고 재사용한다.
  const uniform = await uniformHeight(pid, displayName, sheets, style);
  const { png } = await renderGuideCardFitted(displayName, sheet, style, uniform);
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      // 주소가 곧 결과다(양식이 쿼리에 다 들어 있다). 같은 조합으로 돌아오면 다시 굽지 않는다 —
      // 조합을 이리저리 견주는 게 이 화면의 용도라 되돌아오는 일이 잦다.
      "cache-control": "private, max-age=600",
    },
  });
}
