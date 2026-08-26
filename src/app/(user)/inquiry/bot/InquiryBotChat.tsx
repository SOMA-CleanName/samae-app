"use client";

/* eslint-disable @next/next/no-img-element */
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, SendIcon } from "@/components/user/icons";
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
  createUtteranceQueue,
  slotsToAnswers,
  type AskingKey,
  type BotApiRequest,
  type BotApiResponse,
  type BotChatMessage,
  type LlmSlots,
} from "@/lib/inquiry-bot-llm";
import { buildLegacyInquiryFormData } from "@/lib/inquiry-bot-persist";
import { submitInquiry, ensureBotConversation, type InquiryState } from "../actions";

// 채팅룸형 문의 챗봇 — LLM 대화가 기본, 버튼 상태 머신은 폴백.
// - 기본(LLM): 사용자가 자유 타이핑 → /api/inquiry-bot 왕복 → 봇 답변 + quickReplies 칩.
//   작가 문의대본(photographer-scripts)에 따라 질문이 유도되고, 작가가 개입하면 봇 정지.
// - 폴백(버튼): API 실패 시 기존 C1 상태 머신 플로우로 자동 전환 (아래 postQuestion/onPick 경로 보존)
// - 전 질문 완료 → 요약 카드 게시 → 연락처(위저드 Q6 규칙 재사용) → 기존 submitInquiry 재사용
// - C2: 대본 DB 이관·스튜디오 설정 / C3: conversations DB 연동·실제 작가 개입 (이 파일은 로컬 상태만)

const INITIAL_STATE: InquiryState = { ok: false };

// 드라이런 가드 — 프로덕션이 아니면 submitInquiry 서버 액션을 호출하지 않고 성공 UI만 표시.
// 개발 중 실수로 실제 문의가 접수(작가 SMS 발송)되는 것을 차단한다.
// E2E 실검증이 필요하면 NEXT_PUBLIC_INQUIRY_BOT_LIVE=1 로 dev 에서도 실제 접수.
const DRY_RUN =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_INQUIRY_BOT_LIVE !== "1";

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

// E3: 버블 등장 모션 — transform/opacity 만 사용 (레이아웃 리플로우 없음)
const ITEM_ANIM = "animate-[samaeBubbleIn_180ms_ease-out]";

// 키워드 강조 — 볼드 + 브랜드 컬러 (위저드와 동일 톤)
function Em({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-brand">{children}</b>;
}

// 질문 문구 조각 → 봇 버블 JSX
function renderQuestion(segments: QuestionSegment[]): React.ReactNode {
  if (segments.length === 1 && !segments[0].em) return segments[0].text;
  return segments.map((s, i) => (s.em ? <Em key={i}>{s.text}</Em> : s.text));
}

// 입력 중인 답변을 작가·사진 조합별로 보존 (위저드의 localStorage 패턴 재사용 — 키만 bot 네임스페이스)
// 복합키인 이유: 사진 없이(작가 프로필) 진입한 문의와 특정 사진 문의가 섞이지 않게,
// 그리고 추후 작가별 챗봇 개인화(커스텀 대본)에서도 대화 상태가 작가 단위로 오염되지 않게.
function botStorageKey(photoId: string, photographerId: string) {
  return `samae:inquiry:bot:${photographerId}:${photoId || "direct"}`;
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

// 제출 완료 상태 저장 — 완료된 문의로 재진입하면 연락처 스텝 대신 완료 화면을 보여준다.
// ⚠️ 이 레코드가 없던 것이 "완료 후에도 연락처 입력이 반복"되던 버그의 원인:
// 완료 '사실'을 저장하지 않고 답변만 지워서, 답변이 남아있거나 다시 완주한 세션에서
// 봇이 done 턴을 재생성해 연락처 카드가 또 노출됐다.
type DoneRecord = { at: number; dryRun: boolean; answers: BotAnswers };
function botDoneKey(photoId: string, photographerId: string) {
  return `samae:inquiry:bot:done:${photographerId}:${photoId || "direct"}`;
}
// 진행 중 대화 이력(LLM 트랜스크립트) — 나갔다 돌아와도 채팅방이 그대로 유지되게
function botTxKey(photoId: string, photographerId: string) {
  return `samae:inquiry:bot:tx:${photographerId}:${photoId || "direct"}`;
}
function loadSavedTranscript(key: string): BotChatMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as BotChatMessage[];
  } catch {
    /* 무시 */
  }
  return [];
}
function loadDoneRecord(key: string): DoneRecord | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DoneRecord;
    if (parsed && typeof parsed === "object" && typeof parsed.at === "number") return parsed;
  } catch {
    /* 무시 */
  }
  return null;
}
function saveDoneRecord(key: string, record: Omit<DoneRecord, "at">) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...record, at: Date.now() } satisfies DoneRecord));
  } catch {
    /* 무시 */
  }
}

// 등록 연락처 마스킹 — 010-****-1234
function maskPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length < 8) return p;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

// 레퍼런스 이미지 → 축소 data URL (vision 전송용 — 원본 대신 800px jpeg 로 비용·전송량 절약)
async function downscaleToDataUrl(file: File, maxWidth: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context 없음");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

// 채팅 타임라인 항목 — C3에서 messages 테이블 행으로 승격되는 자리
type ChatItemInput =
  | { kind: "bot"; node: React.ReactNode }
  | { kind: "user"; text: string }
  | { kind: "userImages"; srcs: string[]; caption?: string } // 레퍼런스 이미지 묶음 + 캡션 (objectURL 미리보기)
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
  userPhone,
  loginGateUrl,
}: {
  photographerId: string;
  photographerName: string;
  photographerAvatar: string | null;
  photoId: string;
  photoSrc: string | null;
  photoMoodTags?: string[];
  photoPriceKrw?: number | null;
  /** profiles.phone — 있으면 연락처 스텝을 스킵하고 등록 연락처 한 줄로 대체 */
  userPhone?: string | null;
  /**
   * 로그인 게이트 CTA — 비로그인 + 게이트 활성이면 /login?next= URL.
   * 채팅방 진입·봇 인사까지는 허용하고, 입력바 자리를 카카오 CTA 로 대체한다.
   * TODO(변형안): 첫 1턴(사용자 답 1회)까지 비로그인 허용 후 두 번째 발화 시점에 CTA 전환 —
   *   sendUtterance 진입부에서 llmMessages 의 user 발화 수를 세어 게이트를 지연 발동하면 된다.
   */
  loginGateUrl?: string | null;
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

  // 레퍼런스 이미지 첨부 수 — 드라이런은 미리보기만이라 URL 없음 (URL 은 refImageUrlsRef)
  const [refImageCount, setRefImageCount] = useState(0);
  // 전송 대기 첨부 — 첨부만으로 보내지 않고, 텍스트와 함께 전송 버튼으로 한 턴에 나간다
  const [pendingImages, setPendingImages] = useState<{ id: number; file: File; url: string }[]>([]);
  const pendingIdRef = useRef(0);

  // 완료된 문의 재진입 — 연락처 스텝 대신 완료 화면 (localStorage done 레코드에서 복원)
  const [restoredDone, setRestoredDone] = useState<DoneRecord | null>(null);

  // 비동기 클로저에서 최신 상태를 읽기 위한 미러 ref (큐 재호출·제출 시 업로드 대기용)
  const llmMessagesRef = useRef<BotChatMessage[]>([]);
  useEffect(() => {
    llmMessagesRef.current = llmMessages;
  }, [llmMessages]);
  const slotsRef = useRef<LlmSlots>({});
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  const refImageUrlsRef = useRef<string[]>([]); // 제출 시점 최신 업로드 URL (setState 비동기 무관)
  const uploadPromisesRef = useRef<Promise<void>[]>([]); // D2: 제출 전 진행 중 업로드 await
  // B1: 봇 응답 대기 중 발화 큐 — 입력을 잠그지 않고, 응답 도착 즉시 자동 재호출
  const utteranceQueueRef = useRef(createUtteranceQueue());
  // B3: 내 발화 직후 무조건 바닥 스크롤 마크 (읽는 effect 는 핸들러들 아래에 위치)
  const forceScrollRef = useRef(false);

  const storageKey = botStorageKey(photoId, photographerId);
  const doneKey = botDoneKey(photoId, photographerId);
  const txKey = botTxKey(photoId, photographerId);
  // A3: started 작가 알림 dedupe 마크 — 사진·작가 키당 1회
  const notifiedKey = `samae:inquiry:bot:notified:${photoId || photographerId}`;
  const contactStep = stepIndex >= STEPS.length;
  const done = state.ok || devDone || restoredDone !== null;
  // 로그인 게이트 CTA 활성 — 입력바·칩 대신 카카오 로그인 버튼 (봇 인사·타임라인은 정상 표시)
  const loginGate = !!loginGateUrl && !done;
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

  // 게이트 CTA 계측 — 로그인 이탈률 측정 (노출 1회 / 클릭)
  const wallViewedRef = useRef(false);
  useEffect(() => {
    if (!loginGate || wallViewedRef.current) return;
    wallViewedRef.current = true;
    mpTrack("Inquiry Login Wall Viewed", {
      ...flowPropsRef.current,
      photographer_id: photographerId,
    });
  }, [loginGate, photographerId]);

  function onLoginCta() {
    if (!loginGateUrl) return;
    mpTrack("Inquiry Login Wall Clicked", {
      ...flowPropsRef.current,
      photographer_id: photographerId,
    });
    router.push(loginGateUrl);
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
    // 첫 발화 = 대화방 생성 — 진행 중 문의도 문의 탭에 뜨게 (실패해도 대화 계속)
    void ensureBotConversation(photographerId, photoId || null);
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

  // 전 질문 완료 — 요약 카드 + 안내 후, 등록 번호가 있으면 **자동 접수**한다.
  // 채팅방 진입 자체가 문의 의사이므로 "문의 보내기" 버튼을 다시 누르게 하지 않는다.
  // (번호가 없을 때만 — dev 게이트 오프 등 — 기존 연락처 입력 단계로)
  function postContactPhase(auto: boolean = true) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      push({ kind: "summary" });
      push({
        kind: "bot",
        node: userPhone ? (
          auto ? (
            <>
              정리한 내용을 <Em>{photographerName}</Em>님께 바로 전달할게요.
              <br />
              확인하시면 이 채팅방으로 답장을 주시고, 답장이 오면{" "}
              <Em>{maskPhone(userPhone)}</Em> 문자로도 알려드려요.
            </>
          ) : (
            <>
              내용이 맞는지 확인하고 보내주세요. 답장이 오면 <Em>{maskPhone(userPhone)}</Em>{" "}
              문자로도 알려드려요.
            </>
          )
        ) : (
          <>
            <Em>거의 다 왔어요!</Em>
            <br />
            정리한 내용을 {photographerName}님께 보내드릴게요. 어디로 답변을 받으실래요?
          </>
        ),
      });
      if (auto && userPhone && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        window.setTimeout(() => void submit("phone", userPhone), 400);
      }
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

  // A2: 첫 인사는 LLM 왕복 없이 로컬 고정 — 크롤러 방문 LLM 비용·게이트 우회 비용·
  // "첫 인사가 API 를 기다리는" 지연을 한 번에 제거. 첫 사용자 발화부터 LLM 이 이어받는다.
  function startLocalGreeting(initialSlots: LlmSlots) {
    const curAnswers = slotsToAnswers(initialSlots);
    const resumeAt = nextStepIndex(STEPS, curAnswers);
    if (resumeAt >= STEPS.length) {
      // 저장된 답변으로 이미 코어 완주(대화 기록은 없음) — 일반 인사 대신 재개 안내.
      // 이 경로는 자동 접수하지 않는다: 과거 답변의 재진입이라 사용자 확인(버튼)을 거친다.
      const resumeText = "이전에 작성하시던 문의가 있어요.";
      push({ kind: "bot", node: <>{resumeText}</> });
      setLlmMessages([{ role: "bot", text: resumeText }]);
      setManualSend(true);
      postContactPhase(false);
      return;
    }
    const greetingText = `안녕하세요! ${photographerName}님에게 보내는 문의를 도와드릴게요.\n편하게 입력하셔도 되고, 아래 선택지를 눌러도 좋아요.`;
    push({
      kind: "bot",
      node: (
        <>
          안녕하세요! <Em>{photographerName}</Em>님에게 보내는 문의를 도와드릴게요.
          <br />
          편하게 입력하셔도 되고, 아래 선택지를 눌러도 좋아요.
        </>
      ),
    });
    const step = STEPS[resumeAt];
    const questionText = step.question.map((s) => s.text).join("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      push({ kind: "bot", node: renderQuestion(step.question) });
      setLlmMessages([
        { role: "bot", text: greetingText },
        { role: "bot", text: questionText },
      ]);
      setAsking(step.key as AskingKey);
      setQuickReplies(
        step.type === "options"
          ? [...(step.options ?? []), step.skip]
          : step.type === "date"
            ? ["2주 이내", "한 달 이내", step.skip]
            : [step.skip]
      );
      fireViewed(step, resumeAt);
    }, REVEAL_MS);
  }

  // ── LLM 대화 코어 ──────────────────────────────────────────────

  // API 왕복 — 봇 답변 버블·슬롯 병합·quickReplies·계측. 실패 시 버튼 플로우 폴백.
  // opts.images: 이번 턴 레퍼런스 이미지들(vision 반응, 최대 3장) — 이 턴의 실패는 폴백하지 않는다.
  async function callBot(
    history: BotChatMessage[],
    curSlots: LlmSlots,
    opts?: { images?: string[]; totalImages?: number }
  ) {
    setTyping(true);
    try {
      let startedNotified = false;
      try {
        startedNotified = localStorage.getItem(notifiedKey) === "1";
      } catch {
        /* 무시 */
      }
      const payload: BotApiRequest = {
        photographerId,
        photoId,
        photographerName,
        messages: history,
        slots: curSlots,
        photoContext: { moodTags: photoMoodTags, priceKrw: photoPriceKrw ?? null },
        images: opts?.images?.length ? opts.images.map((dataUrl) => ({ dataUrl })) : undefined,
        totalImages: opts?.totalImages,
        startedNotified,
      };
      // A4: 재시도는 네트워크 오류·5xx 만 — 4xx(인증·상한 위반)는 재시도해도 같은 결과라 금지
      let res: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await fetch("/api/inquiry-bot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.ok || res.status < 500) break;
        } catch {
          res = null; // 네트워크 오류 — 재시도 대상
        }
      }
      if (!res || !res.ok) throw new Error(`inquiry-bot api ${res ? res.status : "network"}`);
      // 첫 실제 발화 처리 성공 — started 알림 dedupe 마크 (사진·작가 키당 1회)
      if (history.some((m) => m.role === "user")) {
        try {
          localStorage.setItem(notifiedKey, "1");
        } catch {
          /* 무시 */
        }
      }
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
        utteranceQueueRef.current.clear();
        setQuickReplies([]);
        postContactPhase();
      } else {
        setQuickReplies(data.quickReplies);
        // B1: 응답 대기 중 쌓인 발화 — 이미 말풍선·이력에 들어있으므로 최신 이력으로 즉시 재호출
        if (utteranceQueueRef.current.size() > 0) {
          utteranceQueueRef.current.drain();
          window.setTimeout(() => {
            void callBot(llmMessagesRef.current, slotsRef.current);
          }, 60); // 상태 커밋(ref 미러) 이후 실행
        }
      }
    } catch (e) {
      setTyping(false);
      // 이미지 반응 턴 실패는 흐름 무영향 — 부드러운 확인 버블만 남기고 봇 정상 유지
      if (opts?.images?.length) {
        push({ kind: "bot", node: <>레퍼런스 이미지 잘 받았어요! 작가님께 함께 전달드릴게요.</> });
        return;
      }
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
    // D1: 작가 커스텀 질문 답변 — 새로 채워진 custom 키별 이벤트 (신설 이름, Q1~Q4·Q6 은 불변)
    const prevCustom = prev.custom ?? {};
    for (const [questionKey, value] of Object.entries(next.custom ?? {})) {
      if (prevCustom[questionKey] || !value) continue;
      mpTrack("Inquiry Custom Answered", {
        ...flowPropsRef.current,
        question_key: questionKey.slice(0, 50),
        skipped: value === "없음",
        value: String(value).slice(0, 100),
      });
    }
    if (nextAsking !== "none" && nextAsking !== "custom") {
      const i = STEPS.findIndex((s) => s.key === nextAsking);
      if (i >= 0) fireViewed(STEPS[i], i);
    } else if (nextAsking === "custom" && !viewedRef.current.has("custom")) {
      viewedRef.current.add("custom");
      mpTrack("Inquiry Custom Viewed", { ...flowPropsRef.current, step: "custom" });
    }
  }

  // 사용자 발화 (타이핑·quickReply 칩 공용) — 말풍선 게시 후 API 왕복
  function sendUtterance(text: string) {
    fireStartInquiry();
    forceScrollRef.current = true; // 내 발화 직후는 무조건 바닥으로
    push({ kind: "user", text });
    setLlmMessages((prev) => [...prev, { role: "user", text }]);
    if (handedOff) return; // 작가가 이어받음 — 말풍선만 남긴다
    if (typing) {
      // B1: 봇 응답 대기 중 발화는 유실하지 않고 큐 — 응답 도착 즉시 자동 재호출
      utteranceQueueRef.current.enqueue(text);
      return;
    }
    setQuickReplies([]);
    void callBot([...llmMessagesRef.current, { role: "user", text }], slots);
  }

  // 레퍼런스 이미지 첨부 — 첨부만으로 전송되지 않는다: 입력바 위 썸네일 스트립에 대기시키고,
  // 텍스트(캡션)와 함께 전송 버튼을 눌렀을 때 한 턴으로 나간다.
  // dev 드라이런: 스토리지 업로드 생략(objectURL 미리보기만) — 프로드 버킷 오염 방지.
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_VISION_IMAGES = 3; // vision 에는 최대 3장 — 나머지는 개수만 언급

  function addPendingImages(files: File[]) {
    if (done || contactStep) return;
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setPendingImages((prev) => [
      ...prev,
      ...imgs.map((file) => ({ id: ++pendingIdRef.current, file, url: URL.createObjectURL(file) })),
    ]);
  }

  function removePendingImage(id: number) {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  // 프로드 전용 스토리지 업로드 — 실패하면 정직하게 안내하고 note 에는 첨부 수만 남는다.
  // D2: promise 를 추적해 제출 시 진행 중 업로드를 기다린다 (URL 누락 레이스 방지).
  const uploadFailNoticedRef = useRef(false);
  function uploadReferenceImage(file: File) {
    const task = (async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/inquiry-bot/upload", { method: "POST", body: fd });
        const data = (await res.json()) as { url?: string };
        if (res.ok && data.url) {
          refImageUrlsRef.current.push(data.url);
          return;
        }
        throw new Error("upload failed");
      } catch {
        if (!uploadFailNoticedRef.current) {
          uploadFailNoticedRef.current = true;
          push({
            kind: "bot",
            node: <>이미지 전송이 잘 안 됐어요. 문의에는 첨부하신 사실만 함께 전달돼요.</>,
          });
        }
      }
    })();
    uploadPromisesRef.current.push(task);
  }

  // 이미지들 + 캡션을 한 턴으로 전송 — 말풍선 그리드 게시 후 vision 반응(최대 3장 묶어 한 번)
  async function sendImagesTurn(caption: string) {
    const imgs = pendingImages;
    if (imgs.length === 0 || done || contactStep) return;
    setPendingImages([]);
    fireStartInquiry();
    forceScrollRef.current = true; // 내 발화 직후는 무조건 바닥으로
    push({ kind: "userImages", srcs: imgs.map((p) => p.url), caption: caption || undefined });
    setRefImageCount((n) => n + imgs.length);
    mpTrack("Inquiry Reference Image Attached", { ...flowPropsRef.current, count: imgs.length });
    const text = caption
      ? `${caption}\n(레퍼런스 이미지 ${imgs.length}장 첨부)`
      : `(레퍼런스 이미지 ${imgs.length}장을 보냈어요)`;
    const history: BotChatMessage[] = [...llmMessagesRef.current, { role: "user", text }];
    setLlmMessages((prev) => [...prev, { role: "user", text }]);
    if (!DRY_RUN) for (const p of imgs) uploadReferenceImage(p.file);
    if (!llmMode || handedOff || typing) return; // 봇 반응 없이 이미지만 남긴다
    setQuickReplies([]);
    let dataUrls: string[] = [];
    try {
      dataUrls = await Promise.all(
        imgs.slice(0, MAX_VISION_IMAGES).map((p) => downscaleToDataUrl(p.file, 800))
      );
    } catch {
      dataUrls = []; // 축소 실패 — 텍스트 플레이스홀더로만 진행
    }
    void callBot(
      history,
      slots,
      dataUrls.length > 0 ? { images: dataUrls, totalImages: imgs.length } : undefined
    );
  }

  // API 실패 폴백 — 기존 버튼 상태 머신 플로우로 전환 (수집된 슬롯은 이어받는다)
  const fallbackNoticeRef = useRef(false); // B6: 폴백 자유 입력 안내 1회 가드
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
    // 이미 완료된 문의 — 대화를 새로 시작하지 않고 완료 상태 화면으로 (연락처 반복 노출 버그 수정)
    const prevDone = loadDoneRecord(doneKey);
    if (prevDone) {
      window.setTimeout(() => {
        setAnswers(prevDone.answers ?? {});
        setRestoredDone(prevDone);
        setItems([
          { id: ++idRef.current, kind: "summary" },
          {
            id: ++idRef.current,
            kind: "notice",
            node: (
              <>
                문의가 접수됐어요. <Em>{photographerName}</Em>님 답변을 기다리고 있어요.
                <br />
                보통 <Em>24시간 내</Em> 답해드려요. 답변이 오면 입력하신 연락처로 알려드릴게요.
                {prevDone.dryRun && (
                  <span className="mt-1.5 block w-fit rounded-md bg-fg/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                    개발 모드 — 실제 전송 안 됨
                  </span>
                )}
              </>
            ),
          },
        ]);
      }, 0);
      return;
    }
    const saved = loadSavedAnswers(storageKey);
    const initialSlots = saved && Object.keys(saved).length > 0 ? answersToSlots(saved) : {};
    for (const k of Object.keys(initialSlots)) viewedRef.current.add(k); // Viewed 재발화 방지
    // 진행 중이던 대화 이력 — 있으면 타임라인을 그대로 재구성 (채팅방 유지)
    const savedTx = loadSavedTranscript(txKey);
    window.setTimeout(() => {
      if (Object.keys(initialSlots).length > 0) {
        setAnswers(slotsToAnswers(initialSlots));
        setSlots(initialSlots);
      }
      if (savedTx.length > 1) {
        setLlmMessages(savedTx);
        setItems(
          savedTx.map((m) => ({
            id: ++idRef.current,
            ...(m.role === "user"
              ? ({ kind: "user", text: m.text } as const)
              : m.role === "photographer"
                ? ({ kind: "photographer", text: m.text } as const)
                : ({
                    kind: "bot",
                    node: <span className="whitespace-pre-line">{m.text}</span>,
                  } as const)),
          }))
        );
        // 복원한 대화가 이미 완주 상태(수집 끝, 미접수) — 방치하지 않고 요약+확인(보내기)으로 잇는다.
        // 과거 대화의 재진입이므로 자동 접수는 하지 않는다.
        if (nextStepIndex(STEPS, slotsToAnswers(initialSlots)) >= STEPS.length) {
          setManualSend(true);
          postContactPhase(false);
        } else {
          // notice 는 완료 CTA 칩(다른 사진 탐색 등)까지 렌더하므로, 진행 중 안내는 일반 봇 버블로
          push({
            kind: "bot",
            node: <>이어서 진행할게요 — 하시던 답변을 계속 입력해 주세요.</>,
          });
        }
        return;
      }
      // A2: 첫 인사는 로컬 — 마운트만으로는 LLM 을 호출하지 않는다
      startLocalGreeting(initialSlots);
    }, 0);
    // started.current 가드로 1회만 실행되는 진입 effect — startLocalGreeting 등은 deps 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 완료 화면의 "새 문의 시작" — 완료 레코드·답변 저장본을 지우고 풀 리로드 없이 상태 리셋
  function startNewInquiry() {
    try {
      localStorage.removeItem(doneKey);
      localStorage.removeItem(storageKey);
      localStorage.removeItem(txKey);
    } catch {
      /* 무시 */
    }
    setItems([]);
    setAnswers({});
    setSlots({});
    setLlmMessages([]);
    setQuickReplies([]);
    setAsking("none");
    setStepIndex(-1);
    setRestoredDone(null);
    setDevDone(false);
    setRefImageCount(0);
    setPendingImages([]);
    setHandedOff(false);
    setLlmMode(true);
    setFreeText("");
    setManualSend(false);
    autoSubmittedRef.current = false;
    refImageUrlsRef.current = [];
    uploadPromisesRef.current = [];
    utteranceQueueRef.current.clear();
    viewedRef.current = new Set();
    startFired.current = false;
    fallbackNoticeRef.current = false;
    uploadFailNoticedRef.current = false;
    window.setTimeout(() => startLocalGreeting({}), 0);
  }

  // 대화 이력 저장 — 나갔다 돌아와도 채팅방(타임라인)이 유지되게 (제출 완료 시 제거)
  useEffect(() => {
    if (done || llmMessages.length <= 1) return;
    try {
      localStorage.setItem(txKey, JSON.stringify(llmMessages).slice(0, 200_000));
    } catch {
      /* 저장 실패는 무해 — 다음 턴에 재시도 */
    }
  }, [llmMessages, done, txKey]);

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

  // B2: 모바일 키보드 — visualViewport 높이로 컨테이너를 줄여 입력바가 키보드 위에 오게.
  // (루트 layout 의 viewport interactiveWidget 설정은 팀 영역이라 침범하지 않고 페이지 범위 대응)
  const [viewportH, setViewportH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const keyboardOpen = vv.height < window.innerHeight - 60;
      setViewportH(keyboardOpen ? Math.round(vv.height) : null);
      // 키보드 등장으로 가려진 최신 메시지 재노출
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // B3: "새 메시지 ↓" 필 상태 — 스크롤 effect 는 ref 수정 지점들 아래(제출부 근처)에 있다
  const [showNewMsgPill, setShowNewMsgPill] = useState(false);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowNewMsgPill(false);
  }

  // 선택지 답변 — 사용자 버블 게시 + 계측 + 다음 질문(또는 요약·연락처)으로
  function onPick(value: string) {
    const step = currentStep;
    if (!step || typing) return;
    fireStartInquiry();
    forceScrollRef.current = true; // 내 발화 직후는 무조건 바닥으로
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
    if (done) return;
    // 대기 중인 첨부 이미지가 있으면 — 이미지들 + 캡션(텍스트)을 한 턴으로 전송
    if (pendingImages.length > 0 && !contactStep) {
      setFreeText("");
      void sendImagesTurn(v);
      return;
    }
    if (!v) return;
    setFreeText("");
    if (llmMode && !contactStep) {
      sendUtterance(v);
      return;
    }
    if (currentStep?.type === "text" && !typing) {
      onPick(v);
      return;
    }
    forceScrollRef.current = true;
    push({ kind: "user", text: v });
    // B6: 폴백 모드 자유 입력이 조용히 무시되지 않게 — 1회 안내 (반복 노이즈 방지)
    if (!fallbackNoticeRef.current) {
      fallbackNoticeRef.current = true;
      push({
        kind: "bot",
        node: (
          <>
            남겨주신 내용은 작가님께 함께 전달돼요. 지금은 아래 <Em>선택지</Em>로 이어갈게요.
          </>
        ),
      });
    }
  }

  // 제출 — 답변·연락처를 FormData 로 변환해 기존 submitInquiry 서버 액션 그대로 재사용
  async function submit(contactType: ContactType, contactValue: string) {
    fireStartInquiry(); // 복원 직후 바로 제출하는 경로에서도 Start 선행 보장
    // 드라이런 — 실제 전송 없이 성공 플로우만 재현 (프로덕션 동작 무영향)
    if (DRY_RUN) {
      setDevDone(true);
      // 완료 상태 기억 — 재진입 시 연락처 스텝 대신 완료 화면 (드라이런 표식 유지)
      saveDoneRecord(doneKey, { dryRun: true, answers });
      try {
        localStorage.removeItem(storageKey);
      localStorage.removeItem(txKey);
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
    // D2: 진행 중인 레퍼런스 업로드를 기다려 note 의 URL 누락 레이스 방지
    if (uploadPromisesRef.current.length > 0) {
      await Promise.allSettled(uploadPromisesRef.current);
    }
    // persist 어댑터(legacy 모드) — C3에서 conversations/messages 저장으로 교체되는 자리.
    // 폴백 모드의 답변(answers)이 진실이므로 코어 슬롯은 answers 에서 재구성한다.
    const fd = buildLegacyInquiryFormData(STEPS, {
      photographerId,
      photoId,
      slots: { ...answersToSlots(answers), custom: slots.custom },
      transcript: llmMessagesRef.current,
      contact: { type: contactType, value: contactValue },
      referenceImageUrls: refImageUrlsRef.current,
      referenceImageCount: refImageCount,
      attribution,
    });
    startTransition(() => formAction(fd));
  }

  // B3: 자동 스크롤 조건화 — 바닥 근처(120px)일 때만 자동, 위에 있으면 "새 메시지 ↓" 필.
  // 단 내 발화 직후(forceScrollRef — 위 핸들러들이 세팅)는 무조건 바닥으로.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom || forceScrollRef.current) {
      forceScrollRef.current = false;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowNewMsgPill(false);
    } else {
      setShowNewMsgPill(true);
    }
  }, [items, typing, done, pending]);

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
  // 자동 접수 1회 가드 + 수동 확인 모드(과거 답변 재진입 시 버튼 노출)
  const autoSubmittedRef = useRef(false);
  const [manualSend, setManualSend] = useState(false);

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
    // 완료 상태 기억 — 재진입 시 연락처 스텝 대신 완료 화면
    saveDoneRecord(doneKey, { dryRun: false, answers });
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(txKey);
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
    // B2: 키보드가 열리면 visualViewport 높이로 줄여 입력바를 키보드 위에 유지
    <div
      className="fixed inset-0 z-30 mx-auto flex h-[100svh] max-w-xl flex-col bg-bg font-kr"
      style={viewportH ? { height: viewportH } : undefined}
    >
      {/* E3: 버블 등장·타이핑 도트 keyframes (페이지 범위 — 전역 CSS 침범 없음) */}
      <style>{`@keyframes samaeBubbleIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>
      {/* 고정 헤더 — 작가명 + 진행 카운터 (채팅방 상단 고정) */}
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06]"
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
          <p className="flex items-center gap-1.5 truncate text-base font-semibold">
            <span className="truncate">{photographerName}</span>
            {/* B5: 봇 정체 표기 — 작가 본인이 아니라 자동 도우미가 응답 중임을 상시 노출 */}
            {!handedOff && (
              <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-muted">
                자동 응답
              </span>
            )}
          </p>
          {/* E4: 진행 표시 — 체크 나열 대신 간결한 카운터 */}
          {handedOff ? (
            <p className="truncate text-xs font-medium text-brand">작가님이 대화를 이어받았어요</p>
          ) : (
            <p className="truncate text-xs text-muted">
              {answeredCount(STEPS, answers) > 0
                ? `${answeredCount(STEPS, answers)}/${STEPS.length} 답변 완료`
                : "기본 정보를 여쭤보고 작가님께 전달해드려요"}
            </p>
          )}
        </div>
        {/* dev 전용 — 작가 개입 시뮬레이션: photographer 발화 추가 후 봇 정지를 화면에서 확인 */}
        {DRY_RUN && llmMode && !handedOff && !done && !loginGate && (
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
        {/* E4: 헤더 사진 썸네일 제거 — 타임라인 상단 사진 카드와 중복이었음 */}
      </header>

      {/* 채팅 타임라인 — role=log 로 신규 메시지를 보조기기에 공손하게 알림 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) setShowNewMsgPill(false);
        }}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-5"
      >
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

        {/* B5: 봇 정체 캡션 — 첫 인사 위에서 발화 주체를 분명히 */}
        <p className="text-center text-[11px] text-muted">
          사매 문의 도우미 · {photographerName}님 대신 기본 정보를 여쭤봐요
        </p>

        {items.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className={`ml-auto w-fit max-w-[85%] ${ITEM_ANIM}`}>
                <div className="rounded-2xl rounded-tr-md bg-brand px-3.5 py-2.5 text-[16px] font-medium text-white">
                  {item.text}
                </div>
              </div>
            );
          }
          if (item.kind === "userImages") {
            const many = item.srcs.length > 1;
            return (
              <div key={item.id} className={`ml-auto w-fit max-w-[78%] space-y-1.5 ${ITEM_ANIM}`}>
                <div className={many ? "grid grid-cols-2 gap-1.5" : undefined}>
                  {item.srcs.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`레퍼런스 이미지 ${i + 1}`}
                      className={
                        many
                          ? "aspect-square w-32 rounded-lg border border-line object-cover"
                          : "max-h-[32svh] w-auto max-w-full rounded-xl rounded-tr-md border border-line object-contain"
                      }
                    />
                  ))}
                </div>
                {item.caption && (
                  <div className="ml-auto w-fit max-w-full rounded-2xl rounded-tr-md bg-brand px-3.5 py-2.5 text-[16px] font-medium text-white">
                    {item.caption}
                  </div>
                )}
              </div>
            );
          }
          if (item.kind === "photographer") {
            // 작가 발화 — 봇 버블과 같은 좌측 정렬이지만 브랜드 톤으로 구분 + '작가' 라벨
            return (
              <div key={item.id} className={`flex items-start gap-2 ${ITEM_ANIM}`}>
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
              <div key={item.id} className={`flex justify-center py-1 ${ITEM_ANIM}`}>
                <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-muted">
                  작가님이 대화를 이어받았어요 · 자동 도우미는 여기서 멈춰요
                </span>
              </div>
            );
          }
          if (item.kind === "summary") {
            return (
              <div key={item.id} className={ITEM_ANIM}>
                <SummaryCard photoSrc={photoSrc} rows={buildSummaryRows(STEPS, answers)} />
              </div>
            );
          }
          if (item.kind === "notice") {
            return (
              <div key={item.id} className={`space-y-2 ${ITEM_ANIM}`}>
                <BotBubble avatar={photographerAvatar} name={photographerName}>
                  {item.node}
                </BotBubble>
                {/* 완료 후 동선 — 채팅방을 닫지 않고도 다음 행동 제안 */}
                <div className="ml-11 flex flex-wrap gap-2">
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
                  {restoredDone && (
                    <button
                      type="button"
                      onClick={startNewInquiry}
                      className="cursor-pointer rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
                    >
                      새 문의 시작
                    </button>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div key={item.id} className={ITEM_ANIM}>
              <BotBubble avatar={photographerAvatar} name={photographerName}>
                {item.node}
              </BotBubble>
            </div>
          );
        })}

        {typing && <TypingBubble avatar={photographerAvatar} name={photographerName} />}

        {/* 연락처 단계 — 등록 번호가 있으면 자동 접수라 카드 없음(실패 시에만 재시도 카드).
            번호가 없을 때만 위저드 Q6 입력 규칙 재사용 (전화/카톡 탭 + 유효성) */}
        {contactStep && !done && (!userPhone || state.error || manualSend) && (
          <ContactCard
            onSubmit={submit}
            pending={pending}
            serverError={state.error}
            flowProps={flowProps}
            registeredPhone={userPhone ?? null}
          />
        )}
      </div>

      {/* B3: 위로 스크롤해 읽는 중 새 메시지 도착 — 강제 스크롤 대신 필 버튼 */}
      {showNewMsgPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-fg shadow-sm transition-transform active:scale-[0.97]"
        >
          새 메시지 ↓
        </button>
      )}
      </div>

      {/* LLM quick reply — 입력창 바로 위의 '보조' 칩 한 줄 (가로 스크롤).
          자유 입력이 주인공이라는 위계: 작게, 은은하게, 탭하면 그 텍스트가 사용자 발화가 된다 */}
      {llmMode && !loginGate && !handedOff && !typing && !done && !contactStep && quickReplies.length > 0 && (
        <div
          role="group"
          aria-label="추천 답변 — 탭해도 되고 직접 입력해도 돼요"
          className="flex gap-1.5 overflow-x-auto px-3 pt-2 pb-0.5 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => sendUtterance(q)}
              className="min-h-[40px] shrink-0 cursor-pointer whitespace-nowrap rounded-full bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-fg/80 ring-1 ring-line transition-transform active:scale-[0.97] active:bg-surface"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 첨부 대기 썸네일 스트립 — 개별 제거 가능, 텍스트와 함께 전송 버튼으로 나간다 */}
      {pendingImages.length > 0 && !done && !loginGate && (
        <div className="flex items-center gap-2 overflow-x-auto px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pendingImages.map((p) => (
            <div key={p.id} className="relative shrink-0 pt-1.5 pr-1.5">
              <img
                src={p.url}
                alt="첨부 대기 이미지"
                className="h-14 w-14 rounded-lg border border-line object-cover"
              />
              <button
                type="button"
                onClick={() => removePendingImage(p.id)}
                aria-label="첨부 제거"
                className="absolute right-0 top-0 grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-fg text-bg before:absolute before:-inset-3 before:content-['']"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
          <p className="shrink-0 text-[11px] text-muted">메시지와 함께 전송돼요</p>
        </div>
      )}

      {/* 선택지 탭 (폴백 상태 머신) — 입력바 위 quick reply (소프트스킵 포함 동등 버튼) */}
      {currentStep && !typing && !done && !loginGate && (
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

      {/* 로그인 게이트 CTA — 입력바 자리를 카카오 버튼으로 대체 (방의 가치를 본 뒤 로그인 유도) */}
      {loginGate ? (
        <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onLoginCta}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-[15px] font-semibold text-[#191919] transition-transform active:scale-[0.99] hover:brightness-95"
          >
            {/* 카카오 말풍선 심볼 */}
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 3C6.75 3 2.5 6.36 2.5 10.5c0 2.64 1.73 4.96 4.35 6.29-.19.7-.7 2.55-.8 2.95-.13.5.18.49.38.36.16-.11 2.48-1.68 3.48-2.36.68.1 1.38.16 2.09.16 5.25 0 9.5-3.36 9.5-7.4S17.25 3 12 3z" />
            </svg>
            카카오로 1초 로그인하고 대화 시작
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">
            로그인하면 문의 내역과 작가님 답변 알림을 받을 수 있어요
          </p>
        </div>
      ) : (
      <form
        onSubmit={sendFreeText}
        className="flex items-center gap-2 border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {/* 레퍼런스 이미지 첨부 — 원하는 느낌의 사진을 대화에 바로 올린다 */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ""; // 같은 파일 재선택 허용
            if (files.length > 0) addPendingImages(files);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={done || contactStep}
          aria-label="레퍼런스 이미지 첨부"
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="M4 17.5l5-4.5 4 3.5 3.5-3 3.5 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          disabled={done}
          aria-label="메시지 입력"
          placeholder={
            done ? "문의가 전달되었어요" : handedOff ? "작가님께 메시지를 남겨보세요" : "하고 싶은 말을 남겨보세요"
          }
          className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[15px] text-fg outline-none transition-colors placeholder:text-faint focus:ring-1 focus:ring-brand/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={done || (!freeText.trim() && pendingImages.length === 0)}
          aria-label="보내기"
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-brand text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {/* E4: 실채팅(ChatRoom)과 같은 전송 아이콘으로 통일 */}
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
      )}
    </div>
  );
}

// ── 말풍선 ───────────────────────────────────────────────────────
// TODO(팀 합의): 실채팅(ChatRoom)·위저드(InquiryChat)와 버블 스타일(radius·색·타이포) 통일 —
// 두 파일 수정이 필요한 팀 영역이라 이번 라운드에서는 보류 (리뷰 '보류' 항목).

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
  // 장식용 인디케이터 — 보조기기에는 읽히지 않게 (role=log 안이라 소음 방지)
  return (
    <div aria-hidden="true">
      <BotBubble avatar={avatar} name={name}>
        <span className="flex items-center gap-1 py-1">
          <Dot delay={0} /> <Dot delay={160} /> <Dot delay={320} />
        </span>
      </BotBubble>
    </div>
  );
}
function Dot({ delay }: { delay: number }) {
  // E3: stagger — 도트가 순차로 깜빡여 '생각 중' 리듬을 만든다
  return (
    <span
      className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg/40"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
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
              {/* E4: truncate 제거 — 커스텀 답변·긴 값도 잘리지 않고 줄바꿈 (break-keep) */}
              <dd className={`min-w-0 flex-1 break-keep font-medium ${r.skipped ? "text-muted" : "text-fg"}`}>
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
  registeredPhone,
}: {
  onSubmit: (type: ContactType, value: string) => void;
  pending: boolean;
  serverError?: string;
  flowProps: FlowProps;
  /** profiles.phone — 있으면 입력 대신 "등록된 연락처로 알림" 한 줄 + (변경) */
  registeredPhone?: string | null;
}) {
  const [type, setType] = useState<ContactType | null>(null);
  const [val, setVal] = useState("");
  const [attempted, setAttempted] = useState(false);
  // 등록 연락처가 있으면 기본은 그 번호 사용 — (변경) 을 눌러야 직접 입력 UI 노출
  const [useRegistered, setUseRegistered] = useState(!!registeredPhone);
  const inputRef = useRef<HTMLInputElement>(null);

  // 등록 번호가 있으면 버튼 하나로 끝 — 안내는 직전 봇 버블이 이미 했다 (동의 고지는 가입 시점으로 이동)
  if (useRegistered && registeredPhone) {
    return (
      <div className="ml-10 mr-auto w-full max-w-[85%]">
        {serverError && <p className="mb-2 text-xs font-medium text-danger">{serverError}</p>}
        <button
          type="button"
          onClick={() => onSubmit("phone", registeredPhone)}
          disabled={pending}
          className="h-11 w-full cursor-pointer rounded-xl bg-brand text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "전달 중…" : "문의 보내기"}
        </button>
        <button
          type="button"
          onClick={() => setUseRegistered(false)}
          className="mt-2 block w-full cursor-pointer text-center text-[11px] text-faint underline underline-offset-2 hover:text-muted"
        >
          다른 연락처로 받기
        </button>
      </div>
    );
  }

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
            // B2: autoFocus 제거 — 모바일에서 카드 노출과 동시에 키보드가 화면을 덮는 문제
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
        </div>
      )}
    </div>
  );
}
