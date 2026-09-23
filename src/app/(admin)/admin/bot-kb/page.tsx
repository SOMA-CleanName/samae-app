import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { ChatIcon } from "@/components/user/icons";
import { normalizeKbCards } from "@/lib/bot-kb-db";
import { KB_CORE_TOPICS } from "@/lib/bot-kb";
import { resolveGuideStyle } from "@/lib/guide-style";
import { hasKb } from "@/lib/bot-kb-data";
import { checkFreshness, type Freshness } from "@/lib/guide-freshness";
import { KbEditor } from "./KbEditor";
import { KbPhotographerList, type KbListRow } from "./KbPhotographerList";
import { BotSettingsPanel } from "./BotSettingsPanel";
import { fetchBotSettingsRaw, FALLBACK_SETTINGS } from "@/lib/bot-settings";

export const dynamic = "force-dynamic";

type KbRow = {
  photographer_id: string;
  cards: unknown;
  greeting: string;
  enabled: boolean;
  note: string;
  updated_at: string;
};

// 어드민 상담봇 — 전역 정책(모든 작가 공통) + 작가별 지식카드.
// 가드는 (admin)/layout 의 role 체크 + 서버액션의 assertAdmin 이중.
export default async function AdminBotKbPage({
  searchParams,
}: {
  searchParams?: Promise<{ photographerId?: string }>;
}) {
  const selectedId = (await searchParams)?.photographerId ?? "";
  const admin = createAdminClient();

  const [{ data: phData }, { data: kbData }, { data: pkgData }, { data: imgData }, settings] =
    await Promise.all([
      admin
        .from("photographers")
        .select("id, display_name, status, guide_style, updated_at")
        .order("display_name"),
      admin
        .from("photographer_bot_kb")
        .select("photographer_id, cards, greeting, enabled, note, updated_at"),
      // 안내가 옛것인지 보려면 "무엇이 언제 바뀌었는지" 가 필요하다
      admin.from("packages").select("photographer_id, updated_at"),
      admin.from("photographer_guide_images").select("photographer_id, image_url, created_at"),
      fetchBotSettingsRaw(),
    ]);

  /** 작가별 가장 최근 시각 */
  const latest = (rows: { photographer_id: string; created_at?: string; updated_at?: string }[]) => {
    const by = new Map<string, string>();
    for (const r of rows) {
      const t = r.updated_at ?? r.created_at;
      if (!t) continue;
      const cur = by.get(r.photographer_id);
      if (!cur || t > cur) by.set(r.photographer_id, t);
    }
    return by;
  };
  const pkgAt = latest((pkgData ?? []) as { photographer_id: string; updated_at: string }[]);
  // 우리가 구운 것만 본다 — 작가가 직접 올린 이미지는 카드와 상관없다
  const sheetAt = latest(
    ((imgData ?? []) as { photographer_id: string; image_url: string; created_at: string }[]).filter(
      (r) => /\/sheet\//.test(r.image_url)
    )
  );

  const kbBy = new Map<string, KbRow>(((kbData ?? []) as KbRow[]).map((r) => [r.photographer_id, r]));

  // 카드 수·커버리지는 저장된 원본이 아니라 정규화 결과 기준 — 봇이 실제로 보는 것과 같아야 한다
  const rows = ((phData ?? []) as {
    id: string;
    display_name: string | null;
    status: string;
    guide_style: unknown;
    updated_at: string;
  }[])
    .map((p) => {
      const kb = kbBy.get(p.id);
      const cards = kb ? normalizeKbCards(kb.cards).cards : [];
      const topics = new Set(cards.map((c) => c.topic));
      return {
        id: p.id,
        name: p.display_name || "(이름 없음)",
        status: p.status,
        kb,
        count: cards.length,
        missing: KB_CORE_TOPICS.filter((t) => !topics.has(t)),
        guideStyle: resolveGuideStyle(p.guide_style),
        demo: hasKb(p.id),
        freshness: checkFreshness({
          kbUpdatedAt: kb?.updated_at ?? null,
          packagesUpdatedAt: pkgAt.get(p.id) ?? null,
          profileUpdatedAt: p.updated_at ?? null,
          imagesBuiltAt: sheetAt.get(p.id) ?? null,
        }) as Freshness,
      };
    })
    .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.name.localeCompare(b.name, "ko"));

  const selected = rows.find((r) => r.id === selectedId);
  const registered = rows.filter((r) => r.count > 0).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">상담봇</h1>
      <p className="mt-1 text-body-sm text-muted">
        작가 부재중 상담봇이 <b className="text-fg">근거로 쓰는 유일한 자료</b>가 아래 지식카드예요. 등록된 작가{" "}
        <b className="text-fg">{registered}</b>명 / 전체 {rows.length}명 · 이번 단계에서는 운영진만 등록·수정합니다.
      </p>

      {/* 전역 정책 — 작가별 KB 위에. 봇이 꺼져 있으면 KB 를 아무리 채워도 소용없다 */}
      <BotSettingsPanel
        enabled={settings.enabled}
        policyText={settings.policyText}
        policyVersion={settings.policyVersion}
        defaultTone={settings.defaultTone}
        model={settings.model}
        updatedAt={settings.updatedAt}
        botName={settings.botName}
        msgGreeting={settings.msgGreeting}
        msgHandoff={settings.msgHandoff}
        msgNoAnswer={settings.msgNoAnswer}
        msgError={settings.msgError}
        fallbackPolicy={FALLBACK_SETTINGS.policy}
        fallbackModel={FALLBACK_SETTINGS.model}
      />

      {rows.length === 0 ? (
        <EmptyState className="mt-6" icon={<ChatIcon className="h-7 w-7" />} title="작가가 없어요" />
      ) : (
        <KbPhotographerList
          selectedId={selectedId}
          rows={rows.map(
            (r): KbListRow => ({
              id: r.id,
              name: r.name,
              status: r.status,
              count: r.count,
              enabled: r.kb?.enabled !== false,
              missing: [...r.missing],
              demo: r.demo,
              freshness: r.freshness,
            })
          )}
          // 편집기는 고른 작가 **행 바로 아래**에서 펼쳐진다 — 목록 끝으로 던지면
          // 작가를 고른 뒤 한참 스크롤해야 하고, 어느 작가를 편집 중인지도 흐려진다.
          editor={
            selected && (
              <KbEditor
                key={selected.id}
                photographerId={selected.id}
                displayName={selected.name}
                cardsJson={
                  selected.kb ? JSON.stringify(normalizeKbCards(selected.kb.cards).cards, null, 2) : ""
                }
                greeting={selected.kb?.greeting ?? ""}
                enabled={selected.kb?.enabled ?? true}
                note={selected.kb?.note ?? ""}
                updatedAt={selected.kb?.updated_at ?? null}
                hasDemo={selected.demo}
                guideStyle={selected.guideStyle}
                freshness={selected.freshness}
              />
            )
          }
        />
      )}
    </main>
  );
}
