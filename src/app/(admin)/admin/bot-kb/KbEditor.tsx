"use client";

// 봇 KB 편집기 — 카드 하나가 곧 "봇이 아는 사실 한 줄" 이다.
//
// 원시 JSON 텍스트에어였을 때의 문제: 운영이 문법까지 책임져야 했고(쉼표 하나에 전체 저장 실패),
// 카드가 늘면 뭐가 들어있는지 훑을 수가 없었고, id 재사용 금지 같은 규칙을 사람이 외워야 했다.
// → 카드 리스트로 바꾸고 문법은 앱이 만든다. JSON 모드는 붙여넣기·일괄 이관용으로만 남긴다.
//
// 서버 계약은 그대로다 — 저장 시 hidden input 에 JSON 배열을 직렬화해 넣는다.

import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { KB_CORE_TOPICS, KB_TOPICS, MAX_CARDS, MAX_CARD_BODY } from "@/lib/bot-kb";
import { saveBotKb, seedFromDemo, type SaveKbState } from "./actions";

// "use server" 모듈은 async 함수만 export 할 수 있다 — 초기 상태 상수를 거기 두면
// 클라이언트에는 undefined 로 도착해 첫 렌더에서 state.errors 가 터진다. 여기서 만든다.
const EMPTY_SAVE_STATE: SaveKbState = { ok: false, errors: [] };

const SOURCES = ["", "운영 확인", "작가 답변"] as const;

// 주제 → id 접두사. 한글 주제는 슬러그가 안 되니 프리셋만 매핑하고 나머지는 card 로.
const ID_PREFIX: Record<string, string> = {
  가격: "price",
  보정: "retouch",
  원본: "original",
  일정변경: "reschedule",
  환불: "refund",
  준비물: "prep",
  촬영장소: "place",
  소요시간: "duration",
  인원: "party",
  출장: "travel",
};

type DraftCard = {
  /** 리액트 키 — 카드를 지우거나 옮겨도 입력 포커스가 튀지 않게 */
  key: string;
  id: string;
  topic: string;
  body: string;
  source: string;
  /** DB 에서 온 카드인지 — 기존 id 는 인용 키라 기본 잠금 */
  existing: boolean;
};

type Props = {
  photographerId: string;
  displayName: string;
  cardsJson: string;
  greeting: string;
  enabled: boolean;
  note: string;
  updatedAt: string | null;
  hasDemo: boolean;
};

let keySeq = 0;
const nextKey = () => `k${keySeq++}`;

function parseInitial(json: string): DraftCard[] {
  try {
    const raw = JSON.parse(json || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((r: Record<string, unknown>) => ({
      key: nextKey(),
      id: String(r?.id ?? ""),
      topic: String(r?.topic ?? ""),
      body: String(r?.body ?? ""),
      source: String(r?.source ?? ""),
      existing: true,
    }));
  } catch {
    return [];
  }
}

/** 겹치지 않는 id 자동 생성 — 운영이 인용 키를 고민하지 않게 */
function autoId(topic: string, taken: Set<string>): string {
  const prefix = ID_PREFIX[topic.trim()] ?? "card";
  for (let n = 1; n < 1000; n++) {
    const candidate = `${prefix}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}-${taken.size + 1}`;
}

function toPayload(cards: DraftCard[]) {
  return cards.map((c) => ({
    id: c.id.trim(),
    topic: c.topic.trim(),
    body: c.body.trim(),
    ...(c.source ? { source: c.source } : {}),
  }));
}

/** 저장 전 검증 — 서버(normalizeKbCards)와 같은 규칙을 카드 옆에 바로 붙여 보여준다 */
function validate(cards: DraftCard[]): Map<string, string> {
  const errs = new Map<string, string>();
  const seen = new Set<string>();
  for (const c of cards) {
    const id = c.id.trim();
    const topic = c.topic.trim();
    const body = c.body.trim();
    if (!id) errs.set(c.key, "id 가 비었어요.");
    else if (!topic) errs.set(c.key, "주제를 골라주세요.");
    else if (!body) errs.set(c.key, "내용을 적어주세요.");
    else if (body.length > MAX_CARD_BODY)
      errs.set(c.key, `내용이 ${MAX_CARD_BODY}자를 넘었어요 (현재 ${body.length}자).`);
    else if (seen.has(id)) errs.set(c.key, `id "${id}" 가 위 카드와 중복이에요.`);
    if (id) seen.add(id);
  }
  return errs;
}

export function KbEditor(props: Props) {
  const [state, formAction] = useActionState(saveBotKb, EMPTY_SAVE_STATE);
  const [cards, setCards] = useState<DraftCard[]>(() => parseInitial(props.cardsJson));
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [seeding, startSeed] = useTransition();

  const cardErrors = useMemo(() => validate(cards), [cards]);
  const payload = useMemo(() => JSON.stringify(toPayload(cards)), [cards]);

  // 주제 커버리지 — 비어 있는 핵심 주제가 곧 "봇이 막히는 지점"이다
  const covered = useMemo(() => {
    const set = new Set(cards.map((c) => c.topic.trim()).filter(Boolean));
    return KB_CORE_TOPICS.map((t) => ({ topic: t, has: set.has(t) }));
  }, [cards]);

  const patch = (key: string, next: Partial<DraftCard>) =>
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, ...next } : c)));

  const addCard = (topic = "") => {
    const key = nextKey();
    setCards((prev) => [
      ...prev,
      {
        key,
        id: autoId(topic, new Set(prev.map((c) => c.id.trim()))),
        topic,
        body: "",
        source: "운영 확인",
        existing: false,
      },
    ]);
    setOpenKey(key);
  };

  const removeCard = (key: string) => setCards((prev) => prev.filter((c) => c.key !== key));

  const move = (key: string, dir: -1 | 1) =>
    setCards((prev) => {
      const i = prev.findIndex((c) => c.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const duplicate = (key: string) => {
    const newKey = nextKey();
    setCards((prev) => {
      const i = prev.findIndex((c) => c.key === key);
      if (i < 0) return prev;
      const src = prev[i];
      const copy: DraftCard = {
        ...src,
        key: newKey,
        id: autoId(src.topic, new Set(prev.map((c) => c.id.trim()))),
        existing: false,
      };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
    setOpenKey(newKey);
  };

  // JSON 모드 — 두 모드가 같은 상태를 본다
  const openJson = () => {
    setJsonText(JSON.stringify(toPayload(cards), null, 2));
    setJsonError(null);
    setJsonMode(true);
  };
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText || "[]");
      if (!Array.isArray(parsed)) throw new Error("최상위가 배열(JSON array)이어야 해요.");
      setCards(parseInitial(jsonText || "[]"));
      setJsonError(null);
      setJsonMode(false);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "형식 오류");
    }
  };

  const seed = () =>
    startSeed(async () => {
      const r = await seedFromDemo(props.photographerId);
      if (r.error) setJsonError(r.error);
      else setCards(parseInitial(r.text));
    });

  const serverErrors = state?.errors ?? [];
  const blocked = cardErrors.size > 0 || cards.length > MAX_CARDS;

  return (
    <form action={formAction} className="mt-2 rounded-2xl border border-fg/25 bg-surface p-4">
      <input type="hidden" name="photographerId" value={props.photographerId} />
      {/* 서버 계약은 그대로 — 편집 결과를 JSON 배열로 직렬화해 보낸다 */}
      <input type="hidden" name="cards" value={payload} />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-title font-semibold">{props.displayName} 님의 봇 지식</p>
        <span className="text-caption text-muted">카드 {cards.length}장</span>
        {props.updatedAt && (
          <span className="text-caption text-faint">
            최근 저장 {new Date(props.updatedAt).toLocaleString("ko-KR")}
          </span>
        )}
        <button
          type="button"
          onClick={jsonMode ? () => setJsonMode(false) : openJson}
          className="ml-auto cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05]"
        >
          {jsonMode ? "카드로 편집" : "JSON으로 편집"}
        </button>
        {props.hasDemo && (
          <button
            type="button"
            onClick={seed}
            disabled={seeding}
            className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05] disabled:opacity-50"
          >
            {seeding ? "불러오는 중…" : "파일 데모 불러오기"}
          </button>
        )}
      </div>
      <p className="mt-1 text-body-sm text-muted">
        봇은 <b className="text-fg">여기 적힌 카드만</b> 근거로 답해요. 없는 건 지어내지 않고 작가님께 넘깁니다.
      </p>

      {/* 커버리지 — 비어 있는 주제가 곧 봇이 막히는 지점이라 맨 위에 둔다 (눌러서 바로 추가) */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-faint">주제 커버리지</span>
        {covered.map(({ topic, has }) => (
          <button
            key={topic}
            type="button"
            onClick={() => !has && addCard(topic)}
            disabled={has}
            title={has ? `${topic} 카드 있음` : `${topic} 카드 추가`}
            className={
              "rounded-full px-2.5 py-1 text-caption font-medium transition-colors " +
              (has
                ? "bg-success-soft text-success"
                : "cursor-pointer bg-fg/[0.06] text-muted ring-1 ring-line hover:bg-fg/10")
            }
          >
            {has ? "✓ " : "+ "}
            {topic}
          </button>
        ))}
      </div>

      {jsonMode ? (
        <div className="mt-4">
          <label className="text-caption text-muted" htmlFor="kb-json">
            카드 JSON (배열) — 붙여넣기·일괄 이관용
          </label>
          <textarea
            id="kb-json"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            rows={20}
            placeholder="[]"
            className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-caption leading-relaxed outline-none focus:border-fg/40"
          />
          {jsonError && <p className="mt-1.5 text-caption text-danger">{jsonError}</p>}
          <button
            type="button"
            onClick={applyJson}
            className="mt-2 cursor-pointer rounded-lg border border-line px-3 py-1.5 text-caption font-semibold transition-colors hover:bg-fg/[0.05]"
          >
            카드에 반영
          </button>
          <p className="mt-1.5 text-caption text-faint">
            반영해도 아직 저장은 아니에요 — 아래 [KB 저장]까지 눌러야 적용됩니다.
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {cards.map((c, i) => {
              const err = cardErrors.get(c.key);
              const open = openKey === c.key;
              return (
                <li
                  key={c.key}
                  className={"rounded-xl border bg-bg " + (err ? "border-danger/40" : "border-line")}
                >
                  {/* 접힌 줄 — 주제 + 내용 첫머리로 훑는다 */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : c.key)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                    >
                      <span className="shrink-0 rounded-full bg-fg/[0.07] px-2 py-0.5 text-caption font-medium text-fg">
                        {c.topic.trim() || "주제 없음"}
                      </span>
                      <span className="truncate text-caption text-muted">
                        {c.body.trim() || "내용을 적어주세요"}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconBtn label="위로" onClick={() => move(c.key, -1)} disabled={i === 0}>
                        ↑
                      </IconBtn>
                      <IconBtn
                        label="아래로"
                        onClick={() => move(c.key, 1)}
                        disabled={i === cards.length - 1}
                      >
                        ↓
                      </IconBtn>
                      <IconBtn label="복제" onClick={() => duplicate(c.key)}>
                        ⧉
                      </IconBtn>
                      <IconBtn label="삭제" onClick={() => removeCard(c.key)} danger>
                        ×
                      </IconBtn>
                    </div>
                  </div>

                  {err && <p className="px-3 pb-2 text-caption text-danger">{err}</p>}

                  {open && (
                    <div className="border-t border-line px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {KB_TOPICS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patch(c.key, { topic: t })}
                            className={
                              "cursor-pointer rounded-full px-2.5 py-1 text-caption transition-colors " +
                              (c.topic === t ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:bg-fg/10")
                            }
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <input
                        value={c.topic}
                        onChange={(e) => patch(c.key, { topic: e.target.value })}
                        placeholder="주제 (직접 입력해도 돼요)"
                        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40"
                      />

                      <textarea
                        value={c.body}
                        onChange={(e) => patch(c.key, { body: e.target.value })}
                        rows={4}
                        placeholder="사실을 한 덩어리로. 조건이 붙으면 조건까지 같이 (예: 마케팅 동의 시 보정본 2장 추가)"
                        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-body-sm leading-relaxed outline-none focus:border-fg/40"
                      />
                      <p className="mt-1 text-caption text-faint">
                        {c.body.trim().length} / {MAX_CARD_BODY}자
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-caption text-muted">
                          출처
                          <select
                            value={c.source}
                            onChange={(e) => patch(c.key, { source: e.target.value })}
                            className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-1.5 text-caption outline-none focus:border-fg/40"
                          >
                            {SOURCES.map((s) => (
                              <option key={s} value={s}>
                                {s || "표시 안 함"}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="ml-auto flex items-center gap-1.5 text-caption text-faint">
                          id
                          <input
                            value={c.id}
                            onChange={(e) => patch(c.key, { id: e.target.value })}
                            readOnly={c.existing}
                            title={
                              c.existing
                                ? "이미 등록된 인용 키예요. 내용이 달라졌다면 이 카드를 지우고 새로 추가하세요."
                                : "봇이 답변 근거를 가리킬 때 쓰는 키 — 자동 생성됩니다."
                            }
                            className={
                              "w-32 rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-caption outline-none focus:border-fg/40 " +
                              (c.existing ? "cursor-not-allowed opacity-60" : "")
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {cards.length === 0 && (
            <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center text-body-sm text-muted">
              아직 카드가 없어요. 위 주제 칩을 눌러 하나씩 채워보세요.
            </p>
          )}

          <button
            type="button"
            onClick={() => addCard()}
            className="mt-2 w-full cursor-pointer rounded-xl border border-dashed border-line px-4 py-2.5 text-body-sm font-semibold text-muted transition-colors hover:bg-fg/[0.04]"
          >
            + 카드 추가
          </button>
        </>
      )}

      {cards.length > MAX_CARDS && (
        <p className="mt-2 text-caption text-danger">
          카드는 최대 {MAX_CARDS}장까지예요 (현재 {cards.length}장).
        </p>
      )}

      {serverErrors.length > 0 && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/[0.06] p-3">
          <p className="text-caption font-semibold text-danger">
            저장하지 않았어요 — 아래를 고쳐주세요 ({serverErrors.length}건)
          </p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-caption text-danger">
            {serverErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {state?.ok && serverErrors.length === 0 && (
        <p className="mt-3 text-caption text-success">저장했어요 — 카드 {state?.count}장.</p>
      )}

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-caption text-muted">첫 인사말 (선택 · 비우면 기본 인사말)</span>
        <input
          name="greeting"
          defaultValue={props.greeting}
          placeholder="안녕하세요! 작가님이 자리를 비운 동안 제가 안내해드릴게요."
          className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
        />
      </label>

      <label className="mt-3 flex flex-col gap-1">
        <span className="text-caption text-muted">운영 메모 (출처·확인일) — 봇에 주입되지 않아요</span>
        <textarea
          name="note"
          defaultValue={props.note}
          rows={2}
          placeholder="2026-08-27 작가 안내 이미지 2장 기준. 환불 규정은 카톡으로 재확인 필요."
          className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
        />
      </label>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-body-sm">
        <input type="checkbox" name="enabled" defaultChecked={props.enabled} className="h-4 w-4 accent-brand" />이
        작가의 봇 KB 사용
      </label>
      <p className="mt-1 text-caption text-faint">
        끄면 봇은 이 작가에 대해 아는 것이 없는 상태로 동작해요 (파일 데모도 쓰지 않음).
      </p>

      <SaveButton blocked={blocked} />
      {blocked && <p className="mt-1.5 text-caption text-danger">빨간 카드를 먼저 고쳐야 저장할 수 있어요.</p>}
    </form>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        "grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-caption transition-colors disabled:cursor-default disabled:opacity-25 " +
        (danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-fg/[0.06]")
      }
    >
      {children}
    </button>
  );
}

function SaveButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || blocked}
      aria-busy={pending}
      className="mt-4 cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "저장 중…" : "KB 저장"}
    </button>
  );
}
