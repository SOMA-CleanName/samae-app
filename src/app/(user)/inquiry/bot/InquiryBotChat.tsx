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
  nextStepIndex,
  validateContact,
  CONTACT_TYPES,
  type BotAnswers,
  type BotStep,
  type ContactType,
  type QuestionSegment,
} from "@/lib/inquiry-bot";
import {
  CORE_SLOT_KEYS,
  answersToSlots,
  slotsToAnswers,
  type AskingKey,
  type BotApiRequest,
  type BotApiResponse,
  type BotChatMessage,
  type LlmSlots,
} from "@/lib/inquiry-bot-llm";
import { buildLegacyInquiryFormData } from "@/lib/inquiry-bot-persist";
import { submitInquiry, type InquiryState } from "../actions";

// 채팅룸형 문의 챗봇 — LLM 대화가 기본, 버튼 상태 머신은 폴백.
// - 기본(LLM): 사용자가 자유 타이핑 → /api/inquiry-bot 왕복 → 봇 답변 + quickReplies 칩.
//   작가 문의대본(photographer-scripts)에 따라 질문이 유도되고, 작가가 개입하면 봇 정지.
// - 폴백(버튼): API 실패 시 기존 C1 상태 머신 플로우로 자동 전환 (아래 postQuestion/onPick 경로 보존)
// - 전 질문 완료 → 요약 카드 게시 → 연락처(위저드 Q6 규칙 재사용) → 기존 submitInquiry 재사용
// - C2: 대본 DB 이관·스튜디오 설정 / C3: conversations DB 연동·실제 작가 개입 (이 파일은 로컬 상태만)

const INITIAL_STATE: InquiryState = { ok: false };

// 드라이런 가드 — 프로덕션이 아니면 submitInquiry 서버 액션을 호출하지 않고 성공 UI만 표시.
// 개발 중 실수로 실제 문의가 접수(작가 SMS 발송)되는 것을 차단한다.
const DRY_RUN = process.env.NODE_ENV !== "production";

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

// LLM 모드 세대 — 같은 Q* 이벤트명에 mode/flow_version 만 바꿔 기존 퍼널에 연속으로 쌓는다
const LLM_FLOW_PROPS = {
  inquiry_flow_version: "v4-llm-bot",
  total_steps: STEPS.length + 1,
  mode: "chatbot-llm",
} as const;

type FlowProps = typeof FLOW_PROPS | typeof LLM_FLOW_PROPS;

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
  | { kind: "photographer"; text: string } // 작가 발화 (개입 데모 — C3에서 실제 메시지로)
  | { kind: "handoff" } // "작가님이 대화를 이어받았어요" 배지
  | { kind: "summary" }
  | { kind: "notice"; node: React.ReactNode };
type ChatItem = ChatItemInput & { id: number };

export function InquiryBotChat({
  photographerId,
  photographerName,
  photographerAvatar,
  photoId,
  photoSrc,
  photoMoodTags,
  photoPriceKrw,
}: {
  photographerId: string;
  photographerName: string;
  photographerAvatar: string | null;
  photoId: string;
  photoSrc: string | null;
  photoMoodTags?: string[];
  photoPriceKrw?: number | null;
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

  // 드라이런 성공 상태 — DRY_RUN 제출 시 서버 액션 없이 완료 UI로 전환
  const [devDone, setDevDone] = useState(false);

  // ── LLM 대화 모드 상태 ──
  const [llmMode, setLlmMode] = useState(true); // API 실패 시 false → 버튼 상태 머신 폴백
  const [llmMessages, setLlmMessages] = useState<BotChatMessage[]>([]);
  const [slots, setSlots] = useState<LlmSlots>({});
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [asking, setAsking] = useState<AskingKey>("none");
  const [handedOff, setHandedOff] = useState(false); // 작가 개입 → 봇 정지

  // 레퍼런스 이미지 — 업로드된 public URL(프로드)과 첨부 수(드라이런은 미리보기만이라 URL 없음)
  const [refImageUrls, setRefImageUrls] = useState<string[]>([]);
  const [refImageCount, setRefImageCount] = useState(0);

  const storageKey = botStorageKey(photoId, photographerId);
  const contactStep = stepIndex >= STEPS.length;
  const done = state.ok || devDone;
  const currentStep = !contactStep && stepIndex >= 0 ? STEPS[stepIndex] : null;

  // 계측 속성 — 모드에 따라 flow_version/mode 만 갈린다 (이벤트명은 동일 유지)
  const flowProps: FlowProps = llmMode ? LLM_FLOW_PROPS : FLOW_PROPS;
  // 언마운트 클로저(trackAbandon 등)에서도 최신 모드 속성을 읽도록 ref 로 미러링
  const flowPropsRef = useRef<FlowProps>(LLM_FLOW_PROPS);
  useEffect(() => {
    flowPropsRef.current = flowProps;
  }, [flowProps]);

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
      ...flowPropsRef.current,
      source: "photo",
      photographer_id: photographerId,
    });
  }

  // 질문 노출 이벤트 — 봇이 질문 버블을 게시한 시점 = Viewed (복원으로 이미 답한 질문은 제외)
  function fireViewed(step: BotStep, i: number) {
    if (viewedRef.current.has(step.key)) return;
    viewedRef.current.add(step.key);
    mpTrack(`${step.ev} Viewed`, {
      ...flowPropsRef.current,
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
          ...flowPropsRef.current,
          step: "contact",
          step_index: STEPS.length + 1,
          step_name: "연락처",
        });
      }
    }, REVEAL_MS);
  }

  // ── LLM 대화 코어 ──────────────────────────────────────────────

  // API 왕복 — 봇 답변 버블·슬롯 병합·quickReplies·계측. 실패 시 버튼 플로우 폴백.
  async function callBot(history: BotChatMessage[], curSlots: LlmSlots) {
    setTyping(true);
    try {
      const payload: BotApiRequest = {
        photographerId,
        photoId,
        photographerName,
        messages: history,
        slots: curSlots,
        photoContext: { moodTags: photoMoodTags, priceKrw: photoPriceKrw ?? null },
      };
      // 일시 오류 1회는 재시도 — 한 번의 실패로 대화 전체가 버튼 폴백으로 강등되지 않게
      let res: Response | null = null;
      for (let attempt = 0; attempt < 2 && !(res && res.ok); attempt++) {
        try {
          res = await fetch("/api/inquiry-bot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {
          res = null; // 네트워크 오류 — 재시도 대상
        }
      }
      if (!res || !res.ok) throw new Error(`inquiry-bot api ${res ? res.status : "network"}`);
      const data = (await res.json()) as BotApiResponse;
      setTyping(false);
      if (data.handedOff) {
        onHandedOff();
        return;
      }
      trackLlmTurn(curSlots, data.slots, data.asking);
      setSlots(data.slots);
      setAnswers(slotsToAnswers(data.slots)); // 요약 카드·제출·localStorage 저장이 이 값을 공유
      // 함수형 업데이트 — 응답 대기 중 사용자가 추가 발화해도 이력이 유실되지 않게
      setLlmMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
      push({ kind: "bot", node: <span className="whitespace-pre-line">{data.reply}</span> });
      setAsking(data.asking);
      if (data.done) {
        setQuickReplies([]);
        postContactPhase();
      } else {
        setQuickReplies(data.quickReplies);
      }
    } catch (e) {
      setTyping(false);
      if (process.env.NODE_ENV !== "production") console.error("[inquiry-bot] fallback:", e);
      enterFallback(slotsToAnswers(curSlots), history.length > 0);
    }
  }

  // 슬롯 계측 — 새로 채워진 코어 슬롯은 Answered, 봇이 새 주제를 묻기 시작하면 Viewed
  function trackLlmTurn(prev: LlmSlots, next: LlmSlots, nextAsking: AskingKey) {
    for (const key of CORE_SLOT_KEYS) {
      const value = next[key];
      if (prev[key] || !value) continue;
      const step = STEPS.find((s) => s.key === key);
      if (!step) continue;
      viewedRef.current.add(key); // 답이 나온 질문 — Viewed 재발화 방지
      mpTrack(`${step.ev} Answered`, {
        ...flowPropsRef.current,
        step: key,
        step_name: step.short,
        skipped: value === step.skip,
        value,
      });
    }
    if (nextAsking !== "none" && nextAsking !== "custom") {
      const i = STEPS.findIndex((s) => s.key === nextAsking);
      if (i >= 0) fireViewed(STEPS[i], i);
    } else if (nextAsking === "custom" && !viewedRef.current.has("custom")) {
      viewedRef.current.add("custom");
      mpTrack("Inquiry QC1 Custom Viewed", { ...flowPropsRef.current, step: "custom" });
    }
  }

  // 사용자 발화 (타이핑·quickReply 칩 공용) — 말풍선 게시 후 API 왕복
  function sendUtterance(text: string) {
    fireStartInquiry();
    push({ kind: "user", text });
    const history: BotChatMessage[] = [...llmMessages, { role: "user", text }];
    setLlmMessages(history);
    if (handedOff || typing) return; // 작가가 이어받았거나 봇 응답 대기 중 — 말풍선만 남긴다
    setQuickReplies([]);
    void callBot(history, slots);
  }

  // API 실패 폴백 — 기존 버튼 상태 머신 플로우로 전환 (수집된 슬롯은 이어받는다)
  function enterFallback(curAnswers: BotAnswers, hadConversation: boolean) {
    setLlmMode(false);
    setQuickReplies([]);
    push({
      kind: "bot",
      node: hadConversation ? (
        <>연결이 잠시 원활하지 않네요. 이어서 <Em>선택지</Em>로 빠르게 진행할게요.</>
      ) : (
        <>
          안녕하세요! <Em>{photographerName}</Em>님에게 보내는 문의를 도와드릴게요.
          <br />
          몇 가지만 여쭤보면 정리해서 작가님께 바로 전달해드려요.
        </>
      ),
    });
    const resumeAt = nextStepIndex(STEPS, curAnswers);
    if (resumeAt >= STEPS.length) postContactPhase();
    else postQuestion(resumeAt);
  }

  // 작가 개입 → 봇 정지 (서버도 photographer 메시지를 보면 LLM 호출을 거부한다)
  function onHandedOff() {
    setHandedOff(true);
    setQuickReplies([]);
    setAsking("none");
    push({ kind: "handoff" });
  }

  // dev 전용 — 작가 개입 시뮬레이션: photographer 발화를 이력에 추가하고 봇이 멈추는 걸 확인
  function simulateHandoff() {
    if (handedOff || done) return;
    const text = "안녕하세요, 작가입니다. 여기서부터는 제가 직접 안내드릴게요.";
    push({ kind: "photographer", text });
    setLlmMessages((prev) => [...prev, { role: "photographer", text }]);
    onHandedOff();
  }

  // 진입 — LLM 모드로 시작: 저장된 답변(슬롯)을 이어받아 첫 봇 턴 요청.
  // 실패하면 callBot 내부에서 버튼 플로우로 폴백된다.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = loadSavedAnswers(storageKey);
    const initialSlots = saved && Object.keys(saved).length > 0 ? answersToSlots(saved) : {};
    for (const k of Object.keys(initialSlots)) viewedRef.current.add(k); // Viewed 재발화 방지
    window.setTimeout(() => {
      if (Object.keys(initialSlots).length > 0) {
        setAnswers(slotsToAnswers(initialSlots));
        setSlots(initialSlots);
      }
      void callBot([], initialSlots);
    }, 0);
    // started.current 가드로 1회만 실행되는 진입 effect — callBot 등은 deps 불필요.
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
      ...flowPropsRef.current,
      step: step.key,
      step_index: stepIndex + 1,
      step_name: step.short,
      skipped: value === step.skip, // soft-skip 도 '답변' — 실제 응답률과 구분
      value,
    });
    if (stepIndex < STEPS.length - 1) postQuestion(stepIndex + 1);
    else postContactPhase();
  }

  // 자유 텍스트 —
  // LLM 모드: 발화 자체가 봇과의 대화 (API 왕복). 작가 개입 후엔 말풍선만 남는다.
  // 폴백 모드: 말풍선으로 남기고 봇은 현재 질문 유지 (규칙 기반 — NLU 하지 않음).
  //   예외: 커스텀 자유 입력 질문(type='text')은 입력 자체가 답변이 된다.
  function sendFreeText(e: React.FormEvent) {
    e.preventDefault();
    const v = freeText.trim();
    if (!v || done) return;
    setFreeText("");
    if (llmMode && !contactStep) {
      sendUtterance(v);
      return;
    }
    if (currentStep?.type === "text" && !typing) {
      onPick(v);
      return;
    }
    push({ kind: "user", text: v });
  }

  // 제출 — 답변·연락처를 FormData 로 변환해 기존 submitInquiry 서버 액션 그대로 재사용
  function submit(contactType: ContactType, contactValue: string) {
    fireStartInquiry(); // 복원 직후 바로 제출하는 경로에서도 Start 선행 보장
    // 드라이런 — 실제 전송 없이 성공 플로우만 재현 (프로덕션 동작 무영향)
    if (DRY_RUN) {
      setDevDone(true);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* 무시 */
      }
      push({
        kind: "notice",
        node: (
          <>
            문의가 <Em>{photographerName}</Em>님께 전달됐어요.
            <br />
            보통 <Em>24시간 내</Em> 답해드려요. 답변이 오면 입력하신 연락처로 알려드릴게요.
            <span className="mt-1.5 block w-fit rounded-md bg-fg/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              개발 모드 — 실제 전송 안 됨
            </span>
          </>
        ),
      });
      return;
    }
    // 유입 어트리뷰션 — AnalyticsTracker 가 sessionStorage 에 담아둔 utm/랜딩 (위저드와 동일)
    let attribution: Record<string, string> | undefined;
    try {
      attribution = JSON.parse(sessionStorage.getItem("samae_utm") || "{}") as Record<string, string>;
      const lp = sessionStorage.getItem("samae_landing");
      if (lp) attribution.landing_path = lp;
    } catch {
      attribution = undefined; // 어트리뷰션 누락이 접수를 막지 않게
    }
    // persist 어댑터(legacy 모드) — C3에서 conversations/messages 저장으로 교체되는 자리.
    // 폴백 모드의 답변(answers)이 진실이므로 코어 슬롯은 answers 에서 재구성한다.
    const fd = buildLegacyInquiryFormData(STEPS, {
      photographerId,
      photoId,
      slots: { ...answersToSlots(answers), custom: slots.custom },
      transcript: llmMessages,
      contact: { type: contactType, value: contactValue },
      referenceImageUrls: refImageUrls,
      referenceImageCount: refImageCount,
      attribution,
    });
    startTransition(() => formAction(fd));
  }

  // 서버 검증 실패 — 제출까지 왔는데 접수가 안 된 이탈 (위저드와 동일 계측)
  const failedStateRef = useRef<InquiryState | null>(null);
  useEffect(() => {
    if (!state.error || failedStateRef.current === state) return;
    failedStateRef.current = state;
    mpTrack("Inquiry Submit Failed", {
      ...flowPropsRef.current,
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
      ...flowPropsRef.current,
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
    // LLM 모드에선 '봇이 지금 묻고 있는 주제(asking)'가 곧 마지막으로 머문 질문
    const llmIdx = llmMode && !contactStep ? STEPS.findIndex((s) => s.key === asking) : -1;
    const cur = contactStep
      ? null
      : llmMode
        ? (llmIdx >= 0 ? STEPS[llmIdx] : null)
        : stepIndex < 0
          ? null
          : STEPS[stepIndex];
    const curIdx = llmMode ? llmIdx : stepIndex;
    snapRef.current = {
      stepEv: contactStep ? CONTACT_EV : (cur?.ev ?? ""),
      stepKey: contactStep ? "contact" : (cur?.key ?? (llmMode && asking === "custom" ? "custom" : "")),
      stepName: contactStep ? "연락처" : (cur?.short ?? ""),
      stepIndex: contactStep ? STEPS.length + 1 : curIdx + 1,
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
      ...flowPropsRef.current,
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
          {/* 슬롯 진행 상태 — 수집된 항목을 은은하게 체크 표시 */}
          {handedOff ? (
            <p className="truncate text-xs font-medium text-brand">작가님이 대화를 이어받았어요</p>
          ) : (
            <p className="truncate text-xs text-muted">
              {STEPS.filter((s) => !s.custom).map((s, i) => {
                const filled = answers[s.key] !== undefined;
                return (
                  <span key={s.key} className={filled ? "text-brand" : undefined}>
                    {i > 0 && <span className="text-faint"> · </span>}
                    {s.short}
                    {filled && (
                      <CheckIcon className="ml-0.5 inline-block h-3 w-3 align-[-1px]" />
                    )}
                  </span>
                );
              })}
            </p>
          )}
        </div>
        {/* dev 전용 — 작가 개입 시뮬레이션: photographer 발화 추가 후 봇 정지를 화면에서 확인 */}
        {DRY_RUN && llmMode && !handedOff && !done && (
          <button
            type="button"
            onClick={simulateHandoff}
            className="shrink-0 cursor-pointer rounded-lg border border-dashed border-line-strong px-2 py-1 text-[10px] font-semibold text-muted transition-colors hover:bg-surface-2"
          >
            작가 개입
            <br />
            시뮬레이션
          </button>
        )}
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
          if (item.kind === "photographer") {
            // 작가 발화 — 봇 버블과 같은 좌측 정렬이지만 브랜드 톤으로 구분 + '작가' 라벨
            return (
              <div key={item.id} className="flex items-start gap-2">
                {photographerAvatar ? (
                  <img src={photographerAvatar} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    {photographerName.slice(0, 1)}
                  </span>
                )}
                <div className="mr-auto max-w-[82%]">
                  <p className="mb-0.5 text-[11px] font-semibold text-brand">{photographerName} · 작가</p>
                  <div className="rounded-2xl rounded-tl-md bg-brand/[0.08] px-3.5 py-2.5 text-[16px] leading-relaxed text-fg ring-1 ring-brand/20">
                    {item.text}
                  </div>
                </div>
              </div>
            );
          }
          if (item.kind === "handoff") {
            // 봇 정지 배지 — 이 시점부터 봇은 어떤 발화에도 응답하지 않는다
            return (
              <div key={item.id} className="flex justify-center py-1">
                <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-muted">
                  작가님이 대화를 이어받았어요 · 자동 도우미는 여기서 멈춰요
                </span>
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
          <ContactCard onSubmit={submit} pending={pending} serverError={state.error} flowProps={flowProps} />
        )}
      </div>

      {/* LLM quick reply — 입력창 바로 위의 '보조' 칩 한 줄 (가로 스크롤).
          자유 입력이 주인공이라는 위계: 작게, 은은하게, 탭하면 그 텍스트가 사용자 발화가 된다 */}
      {llmMode && !handedOff && !typing && !done && !contactStep && quickReplies.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="추천 답변 — 탭해도 되고 직접 입력해도 돼요"
        >
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendUtterance(q)}
              className="shrink-0 cursor-pointer whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-fg/80 ring-1 ring-line transition-transform active:scale-[0.97] active:bg-surface"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 선택지 탭 (폴백 상태 머신) — 입력바 위 quick reply (소프트스킵 포함 동등 버튼) */}
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
          placeholder={
            done ? "문의가 전달되었어요" : handedOff ? "작가님께 메시지를 남겨보세요" : "하고 싶은 말을 남겨보세요"
          }
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
  flowProps,
}: {
  onSubmit: (type: ContactType, value: string) => void;
  pending: boolean;
  serverError?: string;
  flowProps: FlowProps;
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
        ...flowProps,
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
                  mpTrack(`${CONTACT_EV} Type Selected`, { ...flowProps, contact_type: t.key });
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
