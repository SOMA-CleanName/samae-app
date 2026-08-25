"use client";

/* eslint-disable @next/next/no-img-element */
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon } from "@/components/user/icons";
import { mpTrack, mpTrackBeacon } from "@/lib/mixpanel";
import * as Sentry from "@sentry/nextjs";
import {
  buildFlow,
  answerStep,
  answeredCount,
  buildSummaryRows,
  displayAnswer,
  formatKakaoInput,
  formatPhoneInput,
  isISODate,
  toInquiryFields,
  validateContact,
  CONTACT_TYPES,
  type BotAnswers,
  type BotStep,
  type ContactType,
  type QuestionSegment,
} from "@/lib/inquiry-bot";
import { submitInquiry, type InquiryState } from "../actions";

// 채팅룸형 문의 챗봇 (C1) — 봇이 리드하는 진짜 채팅방 UI.
// - 봇 버블이 질문을 던지고, 사용자는 입력바 위 선택지 탭으로 답한다 (소프트스킵 동등 버튼)
// - 자유 텍스트는 그대로 말풍선으로 남기고 봇은 다음 질문 계속 (NLU 없음 — 규칙 기반)
// - 전 질문 완료 → 요약 카드 게시 → 연락처(위저드 Q6 규칙 재사용) → 기존 submitInquiry 재사용
// - C2: buildFlow(작가 커스텀 질문) 주입 / C3: conversations DB 연동·작가 개입 (이 파일은 로컬 상태만)

const INITIAL_STATE: InquiryState = { ok: false };

// C1은 공통 4문항만 — C2에서 서버가 내려주는 작가 커스텀 질문을 buildFlow(custom)로 주입
const STEPS: BotStep[] = buildFlow();

// 퍼널 세대 — 위저드 v2와 같은 이벤트명을 유지하되 mode/flow_version 으로 구분해
// 기존 Mixpanel 퍼널 리포트에 연속으로 쌓인다 (설계 문서 §3 계측 재사용 맵).
const FLOW_VERSION = "v3-chatbot";
const FLOW_PROPS = {
  inquiry_flow_version: FLOW_VERSION,
  total_steps: STEPS.length + 1, // 질문 + 연락처
  mode: "chatbot",
} as const;

// 연락처 이벤트 — Q번호는 '고유 ID'. 위저드와 동일하게 Q6 유지 (InquiryChat 상단 주석 참고)
const CONTACT_EV = "Inquiry Q6 Contact";

const REVEAL_MS = 600; // 봇 타이핑 인디케이터 시간

// 키워드 강조 — 볼드 + 브랜드 컬러 (위저드와 동일 톤)
function Em({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-brand">{children}</b>;
}

// 질문 문구 조각 → 봇 버블 JSX
function renderQuestion(segments: QuestionSegment[]): React.ReactNode {
  if (segments.length === 1 && !segments[0].em) return segments[0].text;
  return segments.map((s, i) => (s.em ? <Em key={i}>{s.text}</Em> : s.text));
}

// 입력 중인 답변을 사진별로 보존 (위저드의 localStorage 패턴 재사용 — 키만 bot 네임스페이스)
function botStorageKey(photoId: string, photographerId: string) {
  return `samae:inquiry:bot:${photoId || photographerId}`;
}
function loadSavedAnswers(key: string): BotAnswers | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as BotAnswers;
  } catch {
    /* 무시 */
  }
  return null;
}

// 채팅 타임라인 항목 — C3에서 messages 테이블 행으로 승격되는 자리
type ChatItemInput =
  | { kind: "bot"; node: React.ReactNode }
  | { kind: "user"; text: string }
  | { kind: "summary" }
  | { kind: "notice"; node: React.ReactNode };
type ChatItem = ChatItemInput & { id: number };

export function InquiryBotChat({
  photographerId,
  photographerName,
  photographerAvatar,
  photoId,
  photoSrc,
}: {
  photographerId: string;
  photographerName: string;
  photographerAvatar: string | null;
  photoId: string;
  photoSrc: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitInquiry, INITIAL_STATE);

  const [items, setItems] = useState<ChatItem[]>([]);
  const [answers, setAnswers] = useState<BotAnswers>({});
  // -1: 인사 전 · 0..n-1: 해당 질문 진행 중 · n(STEPS.length): 연락처 단계
  const [stepIndex, setStepIndex] = useState(-1);
  const [typing, setTyping] = useState(false);
  const [freeText, setFreeText] = useState("");

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const viewedRef = useRef<Set<string>>(new Set());

  const storageKey = botStorageKey(photoId, photographerId);
  const contactStep = stepIndex >= STEPS.length;
  const done = state.ok;
  const currentStep = !contactStep && stepIndex >= 0 ? STEPS[stepIndex] : null;

  function push(item: ChatItemInput) {
    setItems((prev) => [...prev, { ...item, id: ++idRef.current }]);
  }

  // 문의 시작 이벤트 — 페이지 로드가 아니라 '첫 실제 답변·제출' 시점에 발화 (위저드와 동일 규칙,
  // 로드 시 발화하면 광고 검수 봇·크롤러가 전부 잡히는 문제가 있었음).
  const startFired = useRef(false);
  function fireStartInquiry() {
    if (startFired.current) return;
    startFired.current = true;
    mpTrack("Start Inquiry", {
      ...FLOW_PROPS,
      source: "photo",
      photographer_id: photographerId,
    });
  }

  // 질문 노출 이벤트 — 봇이 질문 버블을 게시한 시점 = Viewed (복원으로 이미 답한 질문은 제외)
  function fireViewed(step: BotStep, i: number) {
    if (viewedRef.current.has(step.key)) return;
    viewedRef.current.add(step.key);
    mpTrack(`${step.ev} Viewed`, {
      ...FLOW_PROPS,
      step: step.key,
      step_index: i + 1,
      step_name: step.short,
    });
  }

  // 봇 발화 — 타이핑 인디케이터 후 질문 버블 게시
  function postQuestion(i: number) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      push({ kind: "bot", node: renderQuestion(STEPS[i].question) });
      setStepIndex(i);
      fireViewed(STEPS[i], i);
    }, REVEAL_MS);
  }

  // 전 질문 완료 — 요약 카드 게시 후 연락처 단계로
  function postContactPhase() {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      push({ kind: "summary" });
      push({
        kind: "bot",
        node: (
          <>
            <Em>거의 다 왔어요!</Em>
            <br />
            정리한 내용을 {photographerName}님께 보내드릴게요. 어디로 답변을 받으실래요?
          </>
        ),
      });
      setStepIndex(STEPS.length);
      if (!viewedRef.current.has("contact")) {
        viewedRef.current.add("contact");
        mpTrack(`${CONTACT_EV} Viewed`, {
          ...FLOW_PROPS,
          step: "contact",
          step_index: STEPS.length + 1,
          step_name: "연락처",
        });
      }
    }, REVEAL_MS);
  }

  // 진입 — 인사 버블 후 첫 질문. 저장된 답변이 있으면 Q&A 를 즉시 재구성하고 다음 질문부터 이어감.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const greeting: ChatItem = {
      id: ++idRef.current,
      kind: "bot",
      node: (
        <>
          안녕하세요! <Em>{photographerName}</Em>님에게 보내는 문의를 도와드릴게요.
          <br />
          몇 가지만 여쭤보면 정리해서 작가님께 바로 전달해드려요.
        </>
      ),
    };
    const saved = loadSavedAnswers(storageKey);
    if (saved && Object.keys(saved).length > 0) {
      const rebuilt: ChatItem[] = [greeting];
      let i = 0;
      for (; i < STEPS.length; i++) {
        const v = saved[STEPS[i].key];
        if (v === undefined) break;
        viewedRef.current.add(STEPS[i].key); // 이미 답한 질문 — Viewed 재발화 방지
        rebuilt.push({ id: ++idRef.current, kind: "bot", node: renderQuestion(STEPS[i].question) });
        rebuilt.push({ id: ++idRef.current, kind: "user", text: displayAnswer(STEPS[i], v) });
      }
      const resumeAt = i;
      window.setTimeout(() => {
        setAnswers(saved);
        setItems(rebuilt);
        if (resumeAt >= STEPS.length) postContactPhase();
        else postQuestion(resumeAt);
      }, 0);
      return;
    }
    window.setTimeout(() => {
      setItems([greeting]);
      postQuestion(0);
    }, 0);
    // started.current 가드로 1회만 실행되는 진입 effect — postQuestion 등은 deps 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 입력 변경 시 사진별로 저장 (제출 완료 전까지 — 위저드 패턴)
  useEffect(() => {
    if (done) return;
    try {
      if (Object.keys(answers).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(answers));
      }
    } catch {
      /* 무시 */
    }
  }, [answers, done, storageKey]);

  // 새 버블·타이핑 시 항상 최하단으로 (채팅방 관성)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, typing, done, pending]);

  // 선택지 답변 — 사용자 버블 게시 + 계측 + 다음 질문(또는 요약·연락처)으로
  function onPick(value: string) {
    const step = currentStep;
    if (!step || typing) return;
    fireStartInquiry();
    push({ kind: "user", text: displayAnswer(step, value) });
    setAnswers((prev) => answerStep(prev, step.key, value));
    mpTrack(`${step.ev} Answered`, {
      ...FLOW_PROPS,
      step: step.key,
      step_index: stepIndex + 1,
      step_name: step.short,
      skipped: value === step.skip, // soft-skip 도 '답변' — 실제 응답률과 구분
      value,
    });
    if (stepIndex < STEPS.length - 1) postQuestion(stepIndex + 1);
    else postContactPhase();
  }

  // 자유 텍스트 — 말풍선으로 남기고 봇은 현재 질문 유지 (설계 §1: NLU 하지 않음).
  // 예외: 커스텀 자유 입력 질문(type='text', C2)은 입력 자체가 답변이 된다.
  function sendFreeText(e: React.FormEvent) {
    e.preventDefault();
    const v = freeText.trim();
    if (!v || done) return;
    setFreeText("");
    if (currentStep?.type === "text" && !typing) {
      onPick(v);
      return;
    }
    push({ kind: "user", text: v });
  }

  // 제출 — 답변·연락처를 FormData 로 변환해 기존 submitInquiry 서버 액션 그대로 재사용
  function submit(contactType: ContactType, contactValue: string) {
    fireStartInquiry(); // 복원 직후 바로 제출하는 경로에서도 Start 선행 보장
    const fd = new FormData();
    fd.set("photographerId", photographerId);
    fd.set("photoId", photoId);
    // 답변 → 코어 필드 변환 — 위저드 submit과 동일 규칙 (partySize 스킵=미입력, 날짜=한국어 표기)
    const fields = toInquiryFields(STEPS, answers);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (contactType === "phone") {
      const d = contactValue.replace(/\D/g, "");
      fd.set("phone", `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`);
    } else {
      fd.set("kakaoId", contactValue.trim());
    }
    // 유입 어트리뷰션 — AnalyticsTracker 가 sessionStorage 에 담아둔 utm/랜딩 첨부 (위저드와 동일)
    try {
      const utm = JSON.parse(sessionStorage.getItem("samae_utm") || "{}") as Record<string, string>;
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
        if (utm[k]) fd.set(k, String(utm[k]).slice(0, 200));
      }
      const lp = sessionStorage.getItem("samae_landing");
      if (lp) fd.set("landing_path", lp.slice(0, 300));
    } catch {
      /* 무시 — 어트리뷰션 누락이 접수를 막지 않게 */
    }
    startTransition(() => formAction(fd));
  }

  // 서버 검증 실패 — 제출까지 왔는데 접수가 안 된 이탈 (위저드와 동일 계측)
  const failedStateRef = useRef<InquiryState | null>(null);
  useEffect(() => {
    if (!state.error || failedStateRef.current === state) return;
    failedStateRef.current = state;
    mpTrack("Inquiry Submit Failed", {
      ...FLOW_PROPS,
      reason: "server",
      message: state.error.slice(0, 100),
    });
  }, [state]);

  // 성공 — 전환 기록(문의당 1회) + 완료 안내 버블 + 저장본 정리
  const leadFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state.ok || !state.inquiryId) return;
    if (leadFiredFor.current === state.inquiryId) return;
    leadFiredFor.current = state.inquiryId;
    // 자체 분석 전환 신호 — 실제 접수 완료만 잡는다 (AnalyticsTracker → /api/track)
    window.dispatchEvent(
      new CustomEvent("samae:event", {
        detail: { label: "cta:inquiry_submitted", target: "/inquiry/bot" },
      })
    );
    Sentry.getCurrentScope().setTag("inquiry_submitted", "true");
    mpTrack("Submit Inquiry", {
      ...FLOW_PROPS,
      inquiry_id: state.inquiryId,
      source: "photo",
      photographer_id: photographerId,
      photo_id: photoId,
      item_count: 1,
      // 답변(수요 차원 — 촬영목적·지역·인원·희망일)
      purpose: answers.purpose,
      region: answers.region,
      party_size: answers.partySize,
      preferred_date: answers.preferredDate,
    });
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* 무시 */
    }
    // 완료 안내 버블 — 설계 §1: "[작가명]님이 보통 24시간 내 답해드려요"
    push({
      kind: "notice",
      node: (
        <>
          문의가 <Em>{photographerName}</Em>님께 전달됐어요.
          <br />
          보통 <Em>24시간 내</Em> 답해드려요. 답변이 오면 입력하신 연락처로 알려드릴게요.
        </>
      ),
    });
    // 답변·모드는 제출 성공 시점 값으로 1회만 기록 — leadFiredFor 가드로 중복 방지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.inquiryId]);

  // 이탈 스냅샷 — 언로드/언마운트 시점에 '마지막으로 머문 질문'을 읽기 위한 최신값 보관 (위저드 패턴)
  const snapRef = useRef({ stepEv: "", stepKey: "", stepName: "", stepIndex: 0, answered: 0, done: false });
  useEffect(() => {
    const cur = contactStep || stepIndex < 0 ? null : STEPS[stepIndex];
    snapRef.current = {
      stepEv: contactStep ? CONTACT_EV : (cur?.ev ?? ""),
      stepKey: contactStep ? "contact" : (cur?.key ?? ""),
      stepName: contactStep ? "연락처" : (cur?.short ?? ""),
      stepIndex: contactStep ? STEPS.length + 1 : stepIndex + 1,
      answered: answeredCount(STEPS, answers),
      done,
    };
  });

  const abandonedRef = useRef(false);
  function trackAbandon(via: "back" | "pagehide" | "unmount") {
    const s = snapRef.current;
    if (abandonedRef.current || s.done || !s.stepKey) return;
    abandonedRef.current = true;
    mpTrackBeacon("Inquiry Abandoned", {
      ...FLOW_PROPS,
      last_step: s.stepKey,
      last_step_name: s.stepName,
      last_step_index: s.stepIndex,
      last_step_event: `${s.stepEv} Viewed`,
      answered_count: s.answered,
      via,
      photographer_id: photographerId,
    });
  }
  useEffect(() => {
    const onHide = () => trackAbandon("pagehide");
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      trackAbandon("unmount");
    };
    // 마운트당 1회 — 실제 값은 snapRef(최신 스냅샷)에서 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onBack() {
    trackAbandon("back");
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(photoId ? `/photos/${photoId}` : "/");
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex h-[100svh] max-w-xl flex-col bg-bg font-kr">
      {/* 고정 헤더 — 작가명 + 문의 사진 썸네일 (채팅방 상단 고정) */}
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06]"
        >
          <ArrowLeftIcon />
        </button>
        {photographerAvatar ? (
          <img
            src={photographerAvatar}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-muted">
            {photographerName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{photographerName}</p>
          <p className="truncate text-xs text-muted">자동 문의 도우미가 먼저 몇 가지 여쭤봐요</p>
        </div>
        {photoSrc && (
          <img
            src={photoSrc}
            alt="문의한 사진"
            className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover"
          />
        )}
      </header>

      {/* 채팅 타임라인 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {/* 문의 시작 사진 카드 — 어떤 사진으로 문의를 시작했는지 대화 맨 위에 남긴다 */}
        {photoSrc && (
          <div className="mr-auto max-w-[70%]">
            <img
              src={photoSrc}
              alt="문의한 사진"
              className="max-h-[36svh] w-auto max-w-full rounded-xl border border-line object-contain"
            />
          </div>
        )}

        {items.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className="ml-auto w-fit max-w-[85%]">
                <div className="rounded-2xl rounded-tr-md bg-brand px-3.5 py-2.5 text-[16px] font-medium text-white">
                  {item.text}
                </div>
              </div>
            );
          }
          if (item.kind === "summary") {
            return (
              <SummaryCard
                key={item.id}
                photoSrc={photoSrc}
                rows={buildSummaryRows(STEPS, answers)}
              />
            );
          }
          if (item.kind === "notice") {
            return (
              <div key={item.id} className="space-y-2">
                <BotBubble avatar={photographerAvatar} name={photographerName}>
                  {item.node}
                </BotBubble>
                {/* 완료 후 동선 — 채팅방을 닫지 않고도 다음 행동 제안 */}
                <div className="ml-11 flex gap-2">
                  <Link
                    href="/"
                    className="rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    다른 사진 탐색
                  </Link>
                  <Link
                    href="/my-inquiries"
                    className="rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
                  >
                    문의 내역 보기
                  </Link>
                </div>
              </div>
            );
          }
          return (
            <BotBubble key={item.id} avatar={photographerAvatar} name={photographerName}>
              {item.node}
            </BotBubble>
          );
        })}

        {typing && <TypingBubble avatar={photographerAvatar} name={photographerName} />}

        {/* 연락처 단계 — 위저드 Q6 입력 규칙 재사용 (전화/카톡 탭 + 유효성) */}
        {contactStep && !done && (
          <ContactCard onSubmit={submit} pending={pending} serverError={state.error} />
        )}
      </div>

      {/* 선택지 탭 — 입력바 위 quick reply (소프트스킵 포함 동등 버튼) */}
      {currentStep && !typing && !done && (
        <div className="border-t border-line/60 px-3 py-2.5">
          {currentStep.type === "date" ? (
            <DateChips skip={currentStep.skip} onPick={onPick} />
          ) : currentStep.type === "options" ? (
            <div className="flex flex-wrap gap-2">
              {[...(currentStep.options ?? []), currentStep.skip].map((opt) => (
                <ChipButton key={opt} onClick={() => onPick(opt)}>
                  {opt}
                </ChipButton>
              ))}
            </div>
          ) : (
            // 커스텀 자유 입력 질문(C2) — 스킵 칩만 노출, 답은 아래 입력바로
            <div className="flex flex-wrap gap-2">
              <ChipButton onClick={() => onPick(currentStep.skip)}>{currentStep.skip}</ChipButton>
            </div>
          )}
        </div>
      )}

      {/* 자유 입력바 — 말풍선으로 남고 봇은 흐름 유지 */}
      <form
        onSubmit={sendFreeText}
        className="flex items-center gap-2 border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          disabled={done}
          placeholder={done ? "문의가 전달되었어요" : "하고 싶은 말을 남겨보세요"}
          className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[15px] text-fg outline-none transition-colors placeholder:text-faint focus:ring-1 focus:ring-brand/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={done || !freeText.trim()}
          aria-label="보내기"
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-brand text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// ── 말풍선 ───────────────────────────────────────────────────────

// 봇 버블 — 작가 아바타를 왼쪽에 붙여 채팅방처럼 (실제 발화 주체는 자동 도우미, 헤더에 명시)
function BotBubble({
  avatar,
  name,
  children,
}: {
  avatar: string | null;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {avatar ? (
        <img src={avatar} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
          {name.slice(0, 1)}
        </span>
      )}
      <div className="mr-auto max-w-[82%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5 text-[16px] leading-relaxed text-fg">
        {children}
      </div>
    </div>
  );
}

function TypingBubble({ avatar, name }: { avatar: string | null; name: string }) {
  return (
    <BotBubble avatar={avatar} name={name}>
      <span className="flex items-center gap-1 py-1">
        <Dot /> <Dot /> <Dot />
      </span>
    </BotBubble>
  );
}
function Dot() {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg/40" />;
}

// ── 요약 카드 — 사진·목적·날짜·지역·인원 정리 (C3에서 type='summary_card' 메시지로 승격) ──
function SummaryCard({
  photoSrc,
  rows,
}: {
  photoSrc: string | null;
  rows: ReturnType<typeof buildSummaryRows>;
}) {
  return (
    <div className="ml-10 mr-auto w-full max-w-[85%] overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-brand/[0.06] px-4 py-2.5">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
          <CheckIcon className="h-3 w-3" />
        </span>
        <p className="text-sm font-bold text-fg">문의 내용 정리</p>
      </div>
      <div className="flex gap-3 p-4">
        {photoSrc && (
          <img
            src={photoSrc}
            alt="문의한 사진"
            className="h-20 w-20 shrink-0 rounded-lg border border-line object-cover"
          />
        )}
        <dl className="min-w-0 flex-1 space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-baseline gap-2 text-sm">
              <dt className="w-16 shrink-0 text-muted">{r.label}</dt>
              <dd className={`min-w-0 flex-1 truncate font-medium ${r.skipped ? "text-muted" : "text-fg"}`}>
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ── 선택지 칩 ────────────────────────────────────────────────────
function ChipButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-full bg-surface px-3.5 py-2 text-[14px] font-medium text-fg ring-1 ring-line-strong transition-transform active:scale-[0.97] active:bg-surface-2"
    >
      {children}
    </button>
  );
}

// 날짜 질문 칩 — 빠른 칩 + 날짜 직접 선택(네이티브 피커) + 소프트스킵
function DateChips({ skip, onPick }: { skip: string; onPick: (v: string) => void }) {
  const dateRef = useRef<HTMLInputElement>(null);
  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  function openPicker() {
    const el = dateRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }
  return (
    <div className="relative flex flex-wrap gap-2">
      {["2주 이내", "한 달 이내"].map((q) => (
        <ChipButton key={q} onClick={() => onPick(q)}>
          {q}
        </ChipButton>
      ))}
      <ChipButton onClick={openPicker}>날짜 직접 선택</ChipButton>
      <ChipButton onClick={() => onPick(skip)}>{skip}</ChipButton>
      {/* 시각적으로 숨긴 date input — showPicker 로 네이티브 캘린더를 연다 */}
      <input
        ref={dateRef}
        type="date"
        min={todayISO}
        onChange={(e) => {
          const v = e.target.value;
          if (v && isISODate(v)) onPick(v);
        }}
        aria-label="촬영 희망일 선택"
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
        tabIndex={-1}
      />
    </div>
  );
}

// ── 연락처 카드 — 위저드 Q6(전화/카톡 탭·유효성·개인정보 고지) 규칙 재사용 ──
function ContactCard({
  onSubmit,
  pending,
  serverError,
}: {
  onSubmit: (type: ContactType, value: string) => void;
  pending: boolean;
  serverError?: string;
}) {
  const [type, setType] = useState<ContactType | null>(null);
  const [val, setVal] = useState("");
  const [attempted, setAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = CONTACT_TYPES.find((t) => t.key === type);
  const check = type ? validateContact(type, val) : { valid: false, error: null };
  const errorText = check.valid
    ? null
    : val.trim()
      ? check.error
      : (active?.empty ?? "연락받을 연락처를 입력해주세요.");
  const showError = attempted && !!errorText;

  function handleChange(raw: string) {
    if (type === "phone") setVal(formatPhoneInput(raw));
    else if (type === "kakao") setVal(formatKakaoInput(raw));
    else setVal(raw);
  }

  function handleSubmit() {
    setAttempted(true);
    if (!type || !check.valid) {
      // 제출 버튼까지 눌렀지만 연락처 형식 오류 — 마지막 단계의 숨은 이탈 원인
      mpTrack("Inquiry Submit Failed", {
        ...FLOW_PROPS,
        reason: "invalid_contact",
        contact_type: type ?? "none",
      });
      inputRef.current?.focus();
      return;
    }
    onSubmit(type, val);
  }

  return (
    <div className="ml-10 mr-auto w-full max-w-[85%] rounded-2xl border border-line bg-surface p-3.5">
      <div className="grid grid-cols-2 gap-2">
        {CONTACT_TYPES.map((t) => {
          const on = type === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                // 연락 수단 선택 — 연락처 단계 안에서의 진행 신호 (위저드와 동일 이벤트)
                if (type !== t.key)
                  mpTrack(`${CONTACT_EV} Type Selected`, { ...FLOW_PROPS, contact_type: t.key });
                setType(t.key);
                setVal("");
                setAttempted(false);
              }}
              className={[
                "cursor-pointer rounded-xl py-2.5 text-sm font-medium transition-transform active:scale-[0.97]",
                on ? "bg-brand text-white" : "bg-surface text-fg ring-1 ring-line-strong active:bg-surface-2",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] leading-tight text-muted">
        연락처는 작가 전달 이외의 용도로 사용되지 않습니다.
      </p>

      {type && active && (
        <div className="mt-3">
          <input
            ref={inputRef}
            type="text"
            value={val}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={() => setAttempted(true)}
            placeholder={active.placeholder}
            inputMode={active.inputMode}
            autoFocus
            className={[
              // mp-mask: 세션 리플레이에서 이 입력(연락처=PII)만 마스킹
              "mp-mask h-11 w-full rounded-xl border bg-surface px-3 text-base text-fg outline-none transition-colors placeholder:text-faint",
              showError ? "border-danger" : "border-line-strong focus:border-brand",
            ].join(" ")}
          />
          <p className="mt-1.5 min-h-[18px] text-[11px] font-medium leading-[18px] text-danger">
            {showError ? errorText : ""}
          </p>

          {serverError && <p className="mt-1 text-xs font-medium text-danger">{serverError}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className={[
              "mt-2 h-11 w-full cursor-pointer rounded-xl bg-brand text-base font-semibold text-white transition-opacity",
              check.valid ? "opacity-100 hover:opacity-90" : "opacity-40",
              "disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {pending ? "전달 중…" : "문의 보내기"}
          </button>

          {/* 동의 간주 고지 — 버튼 클릭이 개인정보 수집·이용 동의를 갈음 (위저드와 동일) */}
          <p className="mt-2 break-keep text-center text-[11px] leading-relaxed text-faint">
            보내기를 누르면 연락처 전달 및 상담을 위한{" "}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-muted">
              개인정보 수집·이용
            </Link>
            에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
