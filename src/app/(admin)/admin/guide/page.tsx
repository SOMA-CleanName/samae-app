import { listAllGuideItems, AXIS_ORDER, type GuideAxis } from "@/lib/guide";
import {
  createGuideItem,
  updateGuideItem,
  toggleGuidePublished,
  deleteGuideItem,
} from "./actions";

export const dynamic = "force-dynamic";

/*
  축의 기본 표시 이름.

  DB 에도 `axis_label` 을 두지만(마케팅이 배포 없이 바꿀 수 있게), 새로 만들 때의
  기본값은 여기서 제안한다. 기존 33건이 쓰던 문구 그대로다.
*/
const AXIS_DEFAULT_LABEL: Record<GuideAxis, string> = {
  client: "촬영 준비",
  field: "촬영 실전",
  taste: "취향 읽기",
  maker: "작가의 시선",
  scene: "요즘 스냅",
};

/**
 * Q&A 관리 — 초안 포함.
 *
 * 아티클과 달리 **한 지면에서 다 편집한다.** 항목당 본문이 짧아(대부분 한두 단락)
 * 별도 편집 화면으로 넘기면 왕복이 더 번거롭다.
 */
export default async function AdminGuidePage() {
  const items = await listAllGuideItems();
  const MIN_PAGE_LEN = 200;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Q&amp;A</h1>
        <p className="mt-1.5 text-sm text-muted">
          <code>/guide</code> 허브에 실리는 문답. <b>답이 200자를 넘는 것만</b> 자기 URL(
          <code>/guide/슬러그</code>)을 갖습니다 — 짧은 답을 단독 페이지로 두면 검색에서
          감점(thin content)이라서요. 짧은 답도 허브에는 그대로 실립니다.
        </p>
      </header>

      <form action={createGuideItem} className="mb-8 rounded-xl border border-line p-4">
        <label className="block text-xs font-semibold text-muted">새 질문</label>
        <input
          name="question"
          required
          placeholder="예: 친구가 찍어준 사진과 돈 주고 찍은 사진은 뭐가 다른가?"
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
        <div className="mt-2 flex gap-2">
          <select name="axis" className="rounded-lg border border-line px-3 py-2 text-sm">
            {AXIS_ORDER.map((a) => (
              <option key={a} value={a}>
                {AXIS_DEFAULT_LABEL[a]}
              </option>
            ))}
          </select>
          <input
            name="axis_label"
            placeholder="축 이름(비우면 기본값)"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg"
          >
            만들기
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          비공개로 만들어집니다. 답을 쓰고 공개하세요.
        </p>
      </form>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">아직 항목이 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((g) => {
            const hasOwnPage = g.answer.length >= MIN_PAGE_LEN;
            return (
              <li key={g.id} className="rounded-xl border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      g.published ? "bg-success-soft text-success-ink" : "bg-fg/10 text-muted"
                    }`}
                  >
                    {g.published ? "공개" : "초안"}
                  </span>
                  <span className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-muted">
                    {g.axisLabel || AXIS_DEFAULT_LABEL[g.axis]}
                  </span>
                  {/* 자기 URL 이 있는지 — 운영자가 답을 더 써야 하는지 판단하는 신호다 */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
                      hasOwnPage ? "bg-info-soft text-info-ink" : "bg-warning-soft text-warning-ink"
                    }`}
                  >
                    {g.answer.length}자 {hasOwnPage ? "· 개별 페이지 있음" : "· 허브에만"}
                  </span>
                  <span className="ml-auto truncate text-[11px] text-faint">/{g.slug}</span>
                </div>

                <form action={updateGuideItem} className="space-y-2">
                  <input type="hidden" name="id" value={g.id} />
                  <input
                    name="question"
                    defaultValue={g.question}
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold"
                  />
                  <textarea
                    name="answer"
                    defaultValue={g.answer}
                    rows={6}
                    className="w-full rounded-lg border border-line px-3 py-2 font-mono text-[13px] leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      name="axis"
                      defaultValue={g.axis}
                      className="rounded-lg border border-line px-2 py-1.5 text-sm"
                    >
                      {AXIS_ORDER.map((a) => (
                        <option key={a} value={a}>
                          {AXIS_DEFAULT_LABEL[a]}
                        </option>
                      ))}
                    </select>
                    <input
                      name="axis_label"
                      defaultValue={g.axisLabel}
                      placeholder="축 이름"
                      className="w-32 rounded-lg border border-line px-2 py-1.5 text-sm"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted">
                      순서
                      <input
                        name="sort_order"
                        type="number"
                        defaultValue={g.sortOrder}
                        className="w-16 rounded-lg border border-line px-2 py-1.5 text-sm tabular-nums"
                      />
                    </label>
                    <button
                      type="submit"
                      className="ml-auto min-h-9 rounded-lg bg-fg px-3 text-sm font-semibold text-bg"
                    >
                      저장
                    </button>
                  </div>
                </form>

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <form action={toggleGuidePublished}>
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="next" value={g.published ? "0" : "1"} />
                    <button className="min-h-9 rounded-lg border border-line px-3 text-sm font-semibold">
                      {g.published ? "비공개로" : "공개하기"}
                    </button>
                  </form>
                  {/*
                    삭제는 되돌릴 수 없다. 그래서 버튼이 아니라 **글씨**로 두고 오른쪽 끝에
                    치워 둔다 — 저장·공개와 같은 무게로 나란히 두면 실수로 눌린다.
                  */}
                  <form action={deleteGuideItem} className="ml-auto">
                    <input type="hidden" name="id" value={g.id} />
                    <button className="min-h-9 px-2 text-sm text-danger-ink hover:underline">
                      삭제
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
