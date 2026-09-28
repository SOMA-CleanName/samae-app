import type { KbSection } from "@/lib/kb-sections";

/**
 * 작가 안내 — 주제별 글.
 *
 * 같은 내용이 안내 이미지로도 나간다(채팅). 이미지는 보기 좋지만 **검색엔진도 AI 도
 * 픽셀 안의 글자를 못 읽는다.** 그래서 같은 내용을 글로도 둔다.
 *
 * ⚠️ 크롤러에게만 보여주는 글이 아니다. `<details>` 로 접어 두되 **사람이 펼쳐서 읽을
 *    수 있다** — 안 그러면 클로킹이고, 그건 색인 문제가 아니라 사이트 전체가 강등되는
 *    사유다. 접어 두는 건 지면이 길어지는 걸 막기 위한 것뿐이다.
 *
 * 첫 묶음은 펼쳐 둔다 — 대개 「가격·구성」이고, 고객이 제일 먼저 찾는 것이다.
 */
export function KbSections({ sections }: { sections: KbSection[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-body-sm font-semibold text-fg">촬영 안내</h2>
      <div className="mt-2 flex flex-col gap-1.5">
        {sections.map((s, i) => (
          <details
            key={s.label}
            open={i === 0}
            className="group rounded-2xl border border-line bg-surface px-4 py-3"
          >
            <summary className="cursor-pointer list-none text-body-sm font-medium text-fg marker:hidden">
              {s.label}
              <span className="float-right text-caption text-faint transition-transform group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {s.cards.map((c) => (
                <p key={c.id} className="whitespace-pre-line text-body-sm leading-relaxed text-muted">
                  {c.body}
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
