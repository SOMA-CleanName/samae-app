import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPhotographerKb } from "@/lib/bot-kb-db";
import {
  renderGuideCardFitted,
  fittedHeight,
  groupCardsIntoSheets,
  type GuideSheet,
} from "@/lib/guide-card-template";
import { resolveGuideStyle, type GuideStyle } from "@/lib/guide-style";

export const runtime = "nodejs";

// 작가 촬영 정보 안내 카드 — 사매 통일 양식으로 구운 PNG.
//
// 작가들은 가격·보정·원본 정책을 제각각 만든 이미지로 올린다. 그걸 우리 양식으로
// 통일하는 게 이 라우트다. 다만 **입력은 이미지가 아니라 KB 카드**다:
// 운영이 /admin/bot-kb 에 작가 정보를 옮겨 적으면 → 여기서 그림으로 굽고
// → 같은 데이터를 챗봇이 이미 읽는다. 이미지와 봇이 어긋날 구조가 아예 없다.
//
//   ?pid=<작가>           → 몇 장이 나오는지 목록(JSON)
//   ?pid=<작가>&sheet=1   → 그 장의 PNG (1-based, GUIDE_SHEETS 순서)
//
// 양식은 저장된 값(photographers.guide_style)을 쓰되, 쿼리로 덮어쓸 수 있다
// (&template=&backdrop=&font=&backdropUrl=). 어드민에서 고르는 즉시 결과를 보여주기 위한
// 것이다 — 저장해야만 볼 수 있으면 고르는 동안 비교가 안 된다.
//
// 결과 PNG 는 운영이 받아서 /studio/guide (photographer_guide_images) 에 올린다.
// 운영자 전용 — KB 는 service_role 로 읽으므로 공개하면 아무 작가 KB나 덤프된다.

/**
 * 세트 공통 높이 캐시.
 *
 * 양식을 고를 때마다 5장이 각각 요청으로 들어온다. 매번 세트 전체를 재면 5×5 = 25번을
 * 굽게 되므로, 양식이 같은 동안은 한 번 잰 값을 쓴다. 어드민 한 명이 조합을 고르는
 * 동안만 사는 값이라 메모리에 둔다.
 */
const heightCache = new Map<string, number>();

async function uniformHeight(
  pid: string,
  displayName: string,
  sheets: GuideSheet[],
  style: GuideStyle
): Promise<number> {
  const key = [pid, style.template, style.backdrop, style.font, style.backdropUrl ?? ""].join("|");
  const hit = heightCache.get(key);
  if (hit) return hit;
  const heights = await Promise.all(sheets.map((s) => fittedHeight(displayName, s, style)));
  const max = Math.max(...heights);
  // 조합을 계속 바꿔 보므로 무한정 쌓이지 않게 상한을 둔다
  if (heightCache.size > 40) heightCache.clear();
  heightCache.set(key, max);
  return max;
}

export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get("pid") ?? "";
  if (!pid) return new Response("pid required", { status: 400 });

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
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
