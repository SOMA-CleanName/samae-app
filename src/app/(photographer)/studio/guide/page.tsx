import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyGuideImages, isSamaeSheet } from "@/lib/guide-images";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGuideStyle } from "@/lib/guide-style";
import { fetchPhotographerKb } from "@/lib/bot-kb-db";
import { groupCardsIntoSheets } from "@/lib/guide-card-template";
import { GuideEditor } from "./GuideEditor";
import { GuideStyleSection } from "./GuideStyleSection";

// 고객 안내 이미지 관리 — 사진 상세의 패키지 정보 아래에 세로로 노출되는 촬영 안내 이미지.
// 챗봇이 읽는 지식(KB)과는 별개 자산이라, 작가가 헷갈리지 않게 문구로 분명히 갈라둔다.
export default async function StudioGuidePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/guide");
  if (!me.photographer) redirect("/studio");

  const all = await listMyGuideImages(me.photographer.id);
  // 우리가 구운 촬영정보 이미지는 위 섹션이 맡는다 — 아래 목록에는 작가가 올린 것만 둔다
  const mine = all.filter((img) => !isSamaeSheet(img));
  const { data: p } = await createAdminClient()
    .from("photographers")
    .select("guide_style")
    .eq("id", me.photographer.id)
    .maybeSingle();
  const style = resolveGuideStyle(p?.guide_style);
  // 장 목록은 여기서 세어 넘긴다 — 화면이 뜨자마자 이미지가 보여야 한다(굽는 건 라우트가 한다)
  const kb = await fetchPhotographerKb(me.photographer.id, me.photographer.displayName ?? "");
  const sheets = groupCardsIntoSheets(kb?.cards ?? []).map((s, i) => ({
    sheet: i + 1,
    label: s.label,
    cards: s.cards.length,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <Link href="/studio" className="text-sm text-muted hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-xl font-bold">촬영정보 이미지</h1>
      <p className="mt-1 text-body-sm text-muted">
        고객이 <b>사진 상세</b>에서 보게 되는 안내예요. 좌우로 넘겨 보고, 누르면 크게 볼 수 있어요.
      </p>

      {/* 촬영정보 이미지 — 운영이 등록한 촬영 정보로 구운 것.
          작가가 바꾸는 건 **겉모습뿐**이다(글은 KB 카드라 여기서 못 고친다). */}
      <GuideStyleSection initial={style} sheets={sheets} />

      <section className="mt-10">
        <h2 className="text-body font-semibold">직접 올린 이미지</h2>
        <p className="mt-1 text-body-sm text-muted">
          위 안내 말고 따로 보여주고 싶은 이미지가 있으면 여기에 올려주세요.
        </p>
        <GuideEditor initialImages={mine} />
      </section>
    </div>
  );
}
