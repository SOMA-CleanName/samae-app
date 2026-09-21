"use client";

// 작가 자료 붙여넣기 → 카드 초안 + 불일치 + 질문.
//
// 화면의 무게중심은 카드가 아니라 **불일치와 질문**이다. 카드는 편집기에서 어차피
// 한 장씩 보게 되지만, 불일치는 여기서 놓치면 봇이 틀린 금액을 말하고 나서야 드러난다.

import { useState, useTransition } from "react";
import { extractKbFromText, type ExtractState } from "./actions";

const EMPTY: ExtractState = {
  cardsJson: "",
  conflicts: [],
  questions: [],
  held: [],
  missingCoreTopics: [],
};

export function KbExtractPanel({
  photographerId,
  displayName,
  onCards,
}: {
  photographerId: string;
  displayName: string;
  /** 추출한 카드 JSON — 편집기 카드 목록을 이걸로 갈아끼운다 */
  onCards: (cardsJson: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [result, setResult] = useState<ExtractState>(EMPTY);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await extractKbFromText(photographerId, material);
      setResult(r);
      if (r.cardsJson) onCards(r.cardsJson);
    });

  const hasResult =
    result.conflicts.length > 0 ||
    result.questions.length > 0 ||
    result.held.length > 0 ||
    result.missingCoreTopics.length > 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line px-3 py-1.5 text-caption text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        자료로 초안 만들기
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-line bg-bg p-4">
      <div className="flex items-center gap-2">
        <p className="text-body-sm font-semibold">자료로 초안 만들기</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-caption text-faint transition-colors hover:text-fg"
        >
          닫기
        </button>
      </div>
      <p className="mt-1 text-caption text-muted">
        {displayName} 님이 보내온 안내문을 그대로 붙여넣으세요. 노션·카톡·이미지에서 옮긴 글 아무거나
        됩니다. 사매에 등록된 패키지·소개글과 맞대보고 <b className="text-fg">어긋나는 곳</b>을 찾아냅니다.
      </p>

      <textarea
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
        rows={8}
        placeholder="여기에 작가 자료를 붙여넣으세요"
        className="mt-3 w-full rounded-xl border border-line bg-surface p-3 font-mono text-caption leading-relaxed outline-none focus:border-line-strong"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending || !material.trim()}
          className="rounded-xl bg-brand px-3 py-1.5 text-caption font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {pending ? "읽는 중…" : "초안 만들기"}
        </button>
        <span className="text-caption text-faint">
          {pending
            ? "자료가 길면 2분쯤 걸려요. 창을 닫지 마세요."
            : `${material.length.toLocaleString()}자`}
        </span>
      </div>

      {result.error && (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-caption text-danger-ink">
          {result.error}
        </p>
      )}

      {hasResult && (
        <div className="mt-4 space-y-3">
          {/* 불일치 — 결제 금액과 직결되므로 맨 위 */}
          {result.conflicts.length > 0 && (
            <section className="rounded-xl border border-warning/40 bg-warning-soft/40 p-3">
              <p className="text-caption font-semibold text-warning-ink">
                자료와 사매 등록이 다른 곳 {result.conflicts.length}건
              </p>
              <ul className="mt-2 space-y-2">
                {result.conflicts.map((c, i) => (
                  <li key={i} className="text-caption">
                    <p className="font-medium text-fg">{c.subject}</p>
                    <p className="mt-0.5 text-muted">자료 · {c.fromMaterial}</p>
                    <p className="text-muted">사매 · {c.fromSamae}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.missingCoreTopics.length > 0 && (
            <p className="text-caption text-muted">
              자료에 답이 없는 핵심 주제:{" "}
              <b className="text-fg">{result.missingCoreTopics.join(", ")}</b>
            </p>
          )}

          {/* 보류 카드 — 금지 문구가 섞여 빼둔 것. 버리지 않고 보여준다 */}
          {result.held.length > 0 && (
            <section className="rounded-xl border border-line p-3">
              <p className="text-caption font-semibold">
                빼둔 카드 {result.held.length}장
              </p>
              <p className="mt-0.5 text-caption text-muted">
                사매 밖으로 안내하거나 공통 정책과 겹치는 문구가 있어 초안에서 제외했어요. 필요하면
                문장을 고쳐 직접 추가하세요.
              </p>
              <ul className="mt-2 space-y-1.5">
                {result.held.map((h) => (
                  <li key={h.id} className="text-caption">
                    <span className="rounded bg-line px-1.5 py-0.5 text-faint">{h.reason}</span>{" "}
                    <span className="text-muted">{h.body}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 질문 — 복붙해서 작가에게 보내는 것이 목적 */}
          {result.questions.length > 0 && (
            <section className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <p className="text-caption font-semibold">작가에게 물어볼 것 {result.questions.length}개</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(result.questions.join("\n\n"))}
                  className="ml-auto text-caption text-muted transition-colors hover:text-fg"
                >
                  복사
                </button>
              </div>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                {result.questions.map((q, i) => (
                  <li key={i} className="text-caption text-muted">
                    {q}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
