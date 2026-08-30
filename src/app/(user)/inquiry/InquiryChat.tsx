"use client";

/* eslint-disable @next/next/no-img-element */
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon } from "@/components/user/icons";
import { mpTrack, mpTrackBeacon } from "@/lib/mixpanel";
import { KakaoLoginButton } from "@/components/user/KakaoLoginButton";
import * as Sentry from "@sentry/nextjs";
import { buildFlow, type BotStep, type CustomBotQuestion, type QuestionSegment } from "@/lib/inquiry-bot";
import { submitInquiryToChat, submitMultiInquiry, type InquiryState } from "./actions";

const INITIAL_STATE: InquiryState = { ok: false };

// 채팅형 문의 — 스크롤되는 채팅방. 시스템이 질문을 보내고, 사용자는 질문별 맞춤 입력으로 답함.
// soft-skip은 다른 선택지와 동등한 버튼. 제출 전까진 이전 답변 언제든 수정.
//
// 촬영 예약 트랙(사진 상세의 [촬영 예약하기]) — 연락처는 묻지 않는다. 로그인·번호 인증이
// 이미 전제(채팅 모델)고 작가에게 연락처는 어떤 단계에서도 비공개다. 제출하면 답변이
// 작가 채팅방에 봇 수집과 동일한 요약 카드로 올라가고 사용자는 그 방으로 들어간다.

// 질문 정의는 봇과 공유(inquiry-bot.ts) — 코어 4문항 + 작가 커스텀 질문.
type Step = BotStep & { q: React.ReactNode };

// 질문 데이터는 챗봇(/inquiry/bot)과 공유하는 inquiry-bot.ts 로 분리 —
// 문구 조각(QuestionSegment)을 여기서 <Em> 강조 JSX 로 렌더해 기존과 동일하게 표시한다.
function renderQuestion(segments: QuestionSegment[]): React.ReactNode {
  if (segments.length === 1 && !segments[0].em) return segments[0].text;
  return segments.map((s, i) => (s.em ? <Em key={i}>{s.text}</Em> : s.text));
}

// 마지막 단계(확인·전달) — 질문 이벤트와 같은 규칙의 고유 이름.
//
// ⚠️ Q번호는 '순서'가 아니라 '고유 ID' 다. 절대 당겨쓰지 말 것.
// v3에서 연락처(Q6)를 제거하고 그 자리를 '확인' 단계가 대신한다. Q6 Contact 이벤트는
// 조용히 0이 되므로, 저장된 퍼널에서 마지막 스텝만 Review 로 바꾸면 v2·v3가 이어진다.
const REVIEW_EV = "Inquiry Review";

// 퍼널 세대 구분 — 문항 구성이 바뀔 때마다 올린다. 모든 문의 이벤트에 실려서
// "문항을 줄여 완료율이 올랐는가" 를 세대별로 끊어 볼 수 있게 한다.
//   v1 = 5문항(목적·희망일·지역·인원·문의사항) + 연락처
//   v2 = 4문항(목적·희망일·지역·인원) + 연락처
//   v3 = 4문항 + 작가 커스텀 질문(0~3) + 확인 — 연락처 없음(채팅방으로 바로 전달)
const FLOW_VERSION = "v3";

// 키워드 강조 — 볼드 + 브랜드 컬러
function Em({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-brand">{children}</b>;
}

const REVEAL_MS = 500;
const POST_INQUIRY_KEY = "samae:post-inquiry"; // 완료 후 로그인 복귀 시 탐색 바운스용
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function isISODate(v: string) {
  return ISO_RE.test(v);
}
function formatDateKo(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
}
// 저장값 → 화면 표시 문자열 (날짜 스텝의 ISO 값만 한국어 표기로)
function displayAnswer(step: Step, value: string) {
  if (step.type === "date" && isISODate(value)) return formatDateKo(value);
  return value;
}

// 입력 중인 답변을 사진별로 보존 (새로고침·뒤로가기 후 복원)
function inquiryStorageKey(photoId: string, photographerId: string) {
  return `samae:inquiry:${photoId || photographerId}`;
}
function loadSavedAnswers(key: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch {
    /* 무시 */
  }
  return null;
}

export function InquiryChat({
  photographerId,
  photoId,
  photoSrc,
  photoIds,
  photoSrcs,
  customQuestions,
}: {
  photographerId: string;
  photoId: string;
  photoSrc: string | null;
  // 찜에서 여러 장 묶음 상담(작가별 dedup은 서버에서). 있으면 멀티 모드.
  photoIds?: string[];
  photoSrcs?: string[];
  // 작가가 등록한 커스텀 질문 — 코어 4문항 뒤에 이어 붙는다(봇과 같은 시퀀스)
  customQuestions?: CustomBotQuestion[];
}) {
  const router = useRouter();
  const multi = !!photoIds && photoIds.length > 0;
  const [state, formAction, pending] = useActionState(
    multi ? submitMultiInquiry : submitInquiryToChat,
    INITIAL_STATE
  );

  // 질문 수가 작가마다 달라 스텝은 런타임 구성 — 질문 목록이 같으면 인스턴스를 유지한다.
  const customKey = (customQuestions ?? []).map((q) => q.id).join(",");
  const steps = useMemo<Step[]>(
    () => buildFlow(customQuestions ?? []).map((s) => ({ ...s, q: renderQuestion(s.question) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customKey]
  );
  // 이벤트 공통 prop — step_index 는 '이 버전 안에서의 위치' 라서 total_steps 와 같이 읽어야 한다.
  // (v3의 확인 단계 step_index = 질문 수 + 1. 안정 키가 필요하면 step/last_step 을 쓸 것.)
  const flowProps = useMemo(
    () => ({ inquiry_flow_version: FLOW_VERSION, total_steps: steps.length + 1 }),
    [steps.length]
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(-1); // 노출된 질문 최대 index
  const [typing, setTyping] = useState(false);
  const [optionsReady, setOptionsReady] = useState(false); // 질문 노출 후 1초 뒤 선지 노출
  const [review, setReview] = useState(false); // 마지막 단계 — 확인 후 전달
  const [editing, setEditing] = useState<number | null>(null); // 재선택 중인 질문 index

  const chatRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const optionsEndRef = useRef<HTMLDivElement>(null); // 선지+건너뛰기 하단 — 생성 시 채팅창 바닥에 맞춤
  const started = useRef(false);

  const mode = multi ? "cart" : "photo";

  // 문의 시작 이벤트 — 페이지 로드가 아니라 '첫 실제 상호작용(답변·제출)' 시점에 발화.
  // 로드 시 발화하면 광고 검수 봇·크롤러가 전부 잡힘 (2026-08 스캔에서 Start Inquiry
  // 580건 중 297건이 0초 데스크톱 봇 세션으로 확인됨).
  const startFired = useRef(false);
  function fireStartInquiry() {
    if (startFired.current) return;
    startFired.current = true;
    mpTrack("Start Inquiry", {
      ...flowProps,
      source: mode,
      photographer_id: photographerId,
    });
  }

  const storageKey = multi
    ? `samae:inquiry:cart:${(photoIds ?? []).slice(0, 3).join("_")}`
    : inquiryStorageKey(photoId, photographerId);
  const answeredCount = steps.filter((s) => answers[s.key] !== undefined).length;
  const done = state.ok;
  // 진행률 = 답변한 질문 수 / 전체 질문 수. 확인 단계는 '결승선'이라 질문 카운트에 미포함.
  const totalQ = steps.length;
  const answeredQ = Math.min(answeredCount, totalQ);

  // 로그인·연락처 동선 복귀 주소 — 답변은 localStorage 에 남아 있어 돌아오면 그대로 이어진다.
  const selfUrl = multi
    ? `/inquiry/cart?ids=${(photoIds ?? []).join(",")}`
    : `/inquiry?photographerId=${photographerId}${photoId ? `&photoId=${photoId}` : ""}`;

  // 질문 노출 후 선지는 0.6초 뒤에 펼침 — 질문을 먼저 읽게 하되 너무 늦지 않게.
  // 스크롤은 '질문 상단 고정' 정책이 담당 — 여기선 바닥에 붙이지 않는다(밀림/스냅 제거).
  function revealOptionsSoon() {
    setOptionsReady(false);
    window.setTimeout(() => setOptionsReady(true), 600);
  }
  function advanceTo(index: number) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setRevealed((r) => Math.max(r, index));
      revealOptionsSoon();
    }, REVEAL_MS);
  }
  function revealReview() {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setReview(true);
    }, REVEAL_MS);
  }

  // 진입: 사진 인사 후 첫 질문
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // item10 — 완료 후 로그인 갔다가 '뒤로'로 돌아오면 빈 폼 대신 탐색 탭으로 보냄.
    // (완료 시점에 세션 플래그를 심고, 새로 마운트될 때 감지해 바운스)
    try {
      if (sessionStorage.getItem(POST_INQUIRY_KEY) === "1") {
        sessionStorage.removeItem(POST_INQUIRY_KEY);
        router.replace("/explore");
        return;
      }
    } catch {
      /* 무시 */
    }
    try {
      localStorage.setItem("samae:hooked", "1");
    } catch {
      /* 무시 */
    }
    // 사진별로 저장된 입력이 있으면 복원 (새로고침·로그인 복귀 후 그대로)
    const saved = loadSavedAnswers(storageKey);
    if (saved && Object.keys(saved).length > 0) {
      const cnt = steps.filter((s) => saved[s.key] !== undefined).length;
      window.setTimeout(() => {
        setAnswers(saved);
        if (cnt >= steps.length) {
          setRevealed(steps.length - 1);
          setReview(true);
        } else {
          setRevealed(cnt); // 순차 답변 가정 — 다음 질문을 활성화
          revealOptionsSoon();
        }
      }, 0);
      return;
    }
    // 첫 질문 노출 — 타이머로 미뤄 effect 본문에서 직접 setState 하지 않음
    window.setTimeout(() => advanceTo(0), 0);
    // started.current 가드로 1회만 실행되는 진입 effect — advanceTo 등은 deps 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, storageKey]);

  // 입력 변경 시 사진별로 저장 (제출 완료 전까지)
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

  // 완료 — 세션 플래그(로그인 복귀 동선) + 저장본 정리
  useEffect(() => {
    if (!done) return;
    try {
      sessionStorage.setItem(POST_INQUIRY_KEY, "1");
      localStorage.removeItem(storageKey);
    } catch {
      /* 무시 */
    }
  }, [done, storageKey]);

  // 번호 미등록은 별도 동선(OTP)이 필요해 그대로 보낸다. 돌아오면 저장된 답변으로 이어서 제출.
  //
  // 로그인은 보내지 않는다 — 여기까지 다 채운 사람을 로그인 페이지로 밀어내면 폼이 화면에서
  // 사라지고, 돌아올 이유를 스스로 기억해야 한다. 그 자리에 카카오 버튼을 띄운다(아래).
  useEffect(() => {
    if (state.needContact) router.push(`/signup/contact?next=${encodeURIComponent(selfUrl)}`);
  }, [state.needContact, router, selfUrl]);

  // 접수 완료 → 요약 카드가 올라간 작가 채팅방으로. 여기서부터는 방 안에서 대화가 이어진다.
  useEffect(() => {
    if (state.conversationId) router.replace(`/chat/${state.conversationId}`);
  }, [state.conversationId, router]);

  // ── 질문별 퍼널 계측 ────────────────────────────────────────────
  // 질문마다 고유 이벤트("Inquiry Q3 Region Viewed" / "... Answered")를 쏴서 Mixpanel 퍼널을
  // 스텝별로 그대로 쌓을 수 있게 한다. Viewed 끼리 이어붙이면 '어느 질문에서 이탈했는가'가 바로 나옴.
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (revealed < 0 || review || done) return;
    const step = steps[revealed];
    if (!step || viewedRef.current.has(step.key)) return;
    viewedRef.current.add(step.key);
    mpTrack(`${step.ev} Viewed`, {
      ...flowProps,
      step: step.key,
      step_index: revealed + 1,
      step_name: step.short,
      mode,
    });
  }, [revealed, review, done, mode, steps, flowProps]);

  // 확인 단계 도달 — 저장본 복원으로 바로 진입한 경우까지 잡히게 effect 에서 발화.
  useEffect(() => {
    if (!review || viewedRef.current.has("review")) return;
    viewedRef.current.add("review");
    mpTrack(`${REVIEW_EV} Viewed`, {
      ...flowProps,
      step: "review",
      step_index: steps.length + 1,
      step_name: "확인",
      mode,
    });
  }, [review, mode, steps.length, flowProps]);

  // 서버 검증 실패 — 제출까지 왔는데 접수가 안 된 이탈(퍼널 마지막 구멍).
  // 같은 문구가 반복돼도 세도록 state 객체 동일성으로 중복만 막는다(제출마다 새 객체).
  const failedStateRef = useRef<InquiryState | null>(null);
  useEffect(() => {
    if (!state.error || failedStateRef.current === state) return;
    failedStateRef.current = state;
    mpTrack("Inquiry Submit Failed", {
      ...flowProps,
      reason: "server",
      message: state.error.slice(0, 100),
      mode,
    });
  }, [state, mode, flowProps]);

  // 이탈 스냅샷 — 언로드/언마운트 시점에 '마지막으로 머문 질문'을 읽기 위한 최신값 보관.
  const snapRef = useRef({ stepEv: "", stepKey: "", stepName: "", stepIndex: 0, answered: 0, done: false });
  useEffect(() => {
    // 첫 질문 노출 전(revealed < 0)엔 스냅샷을 비워 둔다 — 진입 직후 바운스가 이탈로 잡히지 않게.
    const cur = review || revealed < 0 ? null : steps[revealed];
    snapRef.current = {
      stepEv: review ? REVIEW_EV : (cur?.ev ?? ""),
      stepKey: review ? "review" : (cur?.key ?? ""),
      stepName: review ? "확인" : (cur?.short ?? ""),
      stepIndex: review ? steps.length + 1 : revealed + 1,
      answered: answeredCount,
      done,
    };
  });

  // 이탈 — 제출 없이 떠난 순간을 '마지막 질문' 과 함께 1회 기록.
  // 언로드 중엔 XHR 이 유실되므로 sendBeacon 으로 보낸다(뒤로가기·탭닫기·앱전환 모두 커버).
  const abandonedRef = useRef(false);
  function trackAbandon(via: "back" | "pagehide" | "unmount") {
    const s = snapRef.current;
    if (abandonedRef.current || s.done || !s.stepKey) return;
    abandonedRef.current = true;
    mpTrackBeacon("Inquiry Abandoned", {
      ...flowProps,
      last_step: s.stepKey,
      last_step_name: s.stepName,
      last_step_index: s.stepIndex,
      last_step_event: `${s.stepEv} Viewed`, // 퍼널에서 이탈 스텝을 바로 찾을 수 있게
      answered_count: s.answered,
      mode,
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

  // 첫 질문은 대화의 시작이 화면 상단에서 보이게 유지한다.
  // 이후 질문부터는 새 선지의 하단을 채팅창 바닥에 맞춰 진행 흐름을 따라간다.
  useEffect(() => {
    if (!optionsReady) return;
    if (revealed === 0 && answeredCount === 0) {
      chatRef.current?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    optionsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [answeredCount, optionsReady, revealed]);

  // 확인·완료 단계 진입 시엔 버튼/모달이 보이게 하단으로.
  useEffect(() => {
    if (review || done) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [review, done]);

  // 성공 — 자체 분석·Mixpanel 전환 기록 (문의당 1회).
  // Meta 픽셀 Lead 는 여기가 아니라 '무료로 견적 받아보기' CTA 클릭에서 발화(meta-lead.ts).
  const leadFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state.ok || !state.inquiryId) return;
    if (leadFiredFor.current !== state.inquiryId) {
      leadFiredFor.current = state.inquiryId;
      // 자체 분석 전환 신호 — 실제 접수 완료만 잡는다(버튼 클릭=시도와 구분).
      // AnalyticsTracker 가 세션 ID·UTM 을 실어 /api/track 으로 전송 → 대시보드 전환 집계.
      window.dispatchEvent(
        new CustomEvent("samae:event", {
          detail: { label: "cta:inquiry_submitted", target: multi ? "/inquiry/cart" : "/inquiry" },
        })
      );
      // Sentry 세션 리플레이 필터용 태그 — 신청자 세션만 골라 진입~이탈 전 과정 재생.
      Sentry.getCurrentScope().setTag("inquiry_submitted", "true");
      mpTrack("Submit Inquiry", {
        ...flowProps,
        inquiry_id: state.inquiryId,
        source: multi ? "cart" : "photo",
        photographer_id: photographerId,
        ...(multi ? {} : { photo_id: photoId }),
        item_count: multi ? photoIds?.length ?? 1 : 1,
        // 위저드 답변(수요 차원 — 촬영목적·지역·인원·희망일).
        purpose: answers.purpose,
        region: answers.region,
        party_size: answers.partySize,
        preferred_date: answers.preferredDate,
        custom_questions: steps.filter((s) => s.custom).length,
      });
    }
    // 답변·모드는 제출 성공 시점 값으로 1회만 기록 — leadFiredFor 가드로 중복 방지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.inquiryId]);

  function onAnswer(i: number, value: string) {
    fireStartInquiry();
    const key = steps[i].key;
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (editing === i) {
      setEditing(null);
      return;
    }
    // item9 — 맨 아래(현재) 질문에 답하면 진행 중이던 수정도 자동으로 닫힘
    if (editing !== null) setEditing(null);
    if (i === revealed) {
      // 질문별 답변 이벤트(전진 답변만 — 수정은 위에서 return). Viewed 대비 Answered 로
      // 질문 단위 이탈률이 바로 나온다.
      mpTrack(`${steps[i].ev} Answered`, {
        ...flowProps,
        step: key,
        step_index: i + 1,
        step_name: steps[i].short,
        mode,
        skipped: value === steps[i].skip, // soft-skip 도 '답변' — 실제 응답률과 구분
        // 커스텀 질문 답변은 자유 입력(개인정보 유입 가능) — 값은 싣지 않는다.
        ...(steps[i].custom ? {} : { value }),
      });
      if (i < steps.length - 1) advanceTo(i + 1);
      else revealReview();
    }
  }

  // 봇 슬롯 형태(코어 4 + custom) — 서버가 봇 접수 경로를 그대로 태울 수 있게 맞춘다.
  // 코어는 원본 값 그대로: 날짜 ISO 변환·인원 소프트스킵 처리는 서버(toInquiryFields)가 한다.
  function buildSlots() {
    const slots: Record<string, unknown> = {};
    const custom: Record<string, string> = {};
    for (const s of steps) {
      const raw = answers[s.key];
      if (raw === undefined) continue;
      if (s.custom) {
        if (raw === s.skip) continue; // 모르겠다는 답은 작가에게 전달하지 않는다
        custom[s.question.map((q) => q.text).join("")] = displayAnswer(s, raw);
      } else {
        slots[s.key] = raw;
      }
    }
    if (Object.keys(custom).length > 0) slots.custom = custom;
    return slots;
  }

  // 제출 — 채팅 트랙은 슬롯 JSON, 묶음 상담은 기존 FormData 계약 그대로.
  function submit() {
    // 저장된 답변 복원 후 바로 제출하는 경로에서도 Start 가 반드시 선행되게 안전망.
    fireStartInquiry();
    const fd = new FormData();
    if (multi) {
      fd.set("photoIds", (photoIds ?? []).join(","));
      for (const s of steps) {
        const raw = answers[s.key];
        if (!raw || s.custom) continue;
        // partySize 는 soft-skip 을 값으로 저장하지 않고 미입력(null)로 처리
        if (s.key === "partySize" && raw === s.skip) continue;
        fd.set(s.key, displayAnswer(s, raw));
      }
    } else {
      fd.set("photographerId", photographerId);
      fd.set("photoId", photoId);
      fd.set("slots", JSON.stringify(buildSlots()));
    }
    // 유입 어트리뷰션 — AnalyticsTracker 가 sessionStorage 에 담아둔 utm/랜딩을 접수에 첨부.
    // fbc(광고 클릭 ID)는 인스타가 오가닉 클릭에도 붙여 광고/스토리 구분이 안 되므로,
    // 정확한 판별용으로 utm_medium(paid_social vs social) 을 함께 저장한다.
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

  // item10 — 완료 모달 동선 (묶음 상담 전용 — 단건은 채팅방으로 바로 이동)
  function goExplore() {
    try {
      sessionStorage.removeItem(POST_INQUIRY_KEY);
    } catch {
      /* 무시 */
    }
    router.replace("/");
  }
  function goSave() {
    // 완료 후 문의 내역으로 — POST_INQUIRY_KEY 는 유지 → 내역에서 '뒤로' 시 탐색으로 바운스.
    router.push("/my-inquiries");
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex h-[100svh] max-w-xl flex-col bg-bg font-kr">
      {/* 상단바 + 진행률 (item8 — 퍼센티지 강조) */}
      <header className="border-b border-line">
        <div className="flex items-center gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06]"
          >
            <ArrowLeftIcon />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">{multi ? "무료 견적 받기" : "촬영 예약 문의"}</p>
            <p className="text-sm text-muted">
              {multi ? "보통 1시간 내 답변드려요" : "작가님과 채팅으로 이어져요"}
            </p>
          </div>
        </div>
        <div className="px-4 pb-3 pt-2">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-fg">
              {review ? "마지막 단계 · 확인" : steps[answeredQ]?.short ?? "질문"}
            </span>
            <span className="text-sm font-bold tabular-nums text-brand">
              {review ? "거의 끝났어요!" : `${answeredQ} / ${totalQ}`}
            </span>
          </div>
          {/* 연결된 도트 스텝퍼 — 완료=체크, 현재=핑(ping) 강조, 미완성=작은 점(크기 리듬) */}
          <div className="flex items-center py-1">
            {Array.from({ length: totalQ }).map((_, i) => {
              const isDone = i < answeredQ;
              const isCurrent = i === answeredQ && !review && !done;
              return (
                <div key={i} className={`flex items-center ${i === 0 ? "" : "flex-1"}`}>
                  {i > 0 && (
                    <span
                      className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                        i <= answeredQ ? "bg-brand" : "bg-fg/15"
                      }`}
                    />
                  )}
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isDone ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand">
                        <CheckIcon className="h-2.5 w-2.5 text-white" />
                      </span>
                    ) : isCurrent ? (
                      <span className="h-4 w-4 rounded-full bg-brand ring-4 ring-brand/30" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-fg/15" />
                    )}
                  </span>
                </div>
              );
            })}
            {/* 레버5 — 마지막(확인) 노드를 처음부터 노출해 '예고 없는 마지막 단계' 서프라이즈 제거.
                질문 중엔 작은 점(예정), 확인 단계에선 ping, 완료 시 체크. */}
            {(() => {
              const allAnswered = answeredQ >= totalQ;
              return (
                <div className="flex flex-1 items-center">
                  <span
                    className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                      allAnswered ? "bg-brand" : "bg-fg/15"
                    }`}
                  />
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {done ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand">
                        <CheckIcon className="h-2.5 w-2.5 text-white" />
                      </span>
                    ) : review ? (
                      <span className="h-4 w-4 rounded-full bg-brand ring-4 ring-brand/30" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-fg/15" />
                    )}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      </header>

      {/* 채팅 본문 — 첫 대화는 상단에서 시작하고, 후속 질문만 현재 진행 위치로 자동 스크롤한다. */}
      <div ref={chatRef} className="flex flex-1 flex-col space-y-3 overflow-y-auto px-4 py-5">
        {/* 진입 사진 + 인사 (시스템) — 비율 유지(자르지 않음) */}
        <SystemBubble>
          {multi ? (
            (photoSrcs ?? []).length > 0 && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto">
                {(photoSrcs ?? []).map((s, i) => (
                  <img
                    key={i}
                    src={s}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
            )
          ) : (
            photoSrc && (
              <img
                src={photoSrc}
                alt="문의한 사진"
                className="mx-auto mb-2 block max-h-[min(42svh,20rem)] w-auto max-w-full rounded-xl object-contain"
              />
            )
          )}
          짧게 <Em>몇 가지 질문</Em>에만 답해주시면
          <br />
          {multi ? (
            <>
              선택한 사진의 <Em>작가님들과 연결</Em>해드려요.
            </>
          ) : (
            <>
              사진을 찍은 <Em>작가님과 채팅</Em>으로 이어드려요.
            </>
          )}
        </SystemBubble>

        {/* 질문/답변 */}
        {steps.map((step, i) => {
          const answered = answers[step.key] !== undefined;
          const isEditing = editing === i;

          // item4/5/6 — 수정 중: 질문 강조 + 답변 칩 유지 + 선택지 부드럽게 펼침
          if (isEditing) {
            return (
              <div key={step.key} className="space-y-1.5">
                <SystemBubble emphasis>{step.q}</SystemBubble>
                {answered && (
                  <div className="ml-auto w-fit max-w-[88%]">
                    <SentBubble muted>{displayAnswer(step, answers[step.key]!)}</SentBubble>
                  </div>
                )}
                <ExpandIn>
                  <UserTray>
                    <QuestionInput
                      step={step}
                      value={answers[step.key]}
                      onSubmit={(v) => onAnswer(i, v)}
                      onCancel={() => setEditing(null)}
                    />
                  </UserTray>
                </ExpandIn>
              </div>
            );
          }

          // 답변 완료 또는 현재 노출 스텝을 한 블록으로 렌더 — 답변 시 선지 Reveal 이 즉시
          // 언마운트되지 않고 부드럽게 닫히게, 질문·답변칩은 ExpandIn 으로 등장 → 레이아웃 시프트 완화.
          // 자식 key(q/a/opts)로 answered 전환 시에도 Reveal 인스턴스가 보존돼 닫힘 애니가 재생된다.
          if (answered || (!review && i === revealed)) {
            return (
              <div key={step.key} className="space-y-1.5">
                <ExpandIn key="q">
                  <SystemBubble>{step.q}</SystemBubble>
                </ExpandIn>
                {answered && (
                  <ExpandIn key="a">
                    <div className="ml-auto flex w-fit max-w-[88%] flex-col items-end gap-0.5">
                      <SentBubble>{displayAnswer(step, answers[step.key]!)}</SentBubble>
                      {!done && (
                        <button
                          type="button"
                          onClick={() => setEditing(i)}
                          className="cursor-pointer px-1 text-[11px] text-faint transition-colors hover:text-muted"
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </ExpandIn>
                )}
                {i === revealed && !review && (
                  <Reveal key="opts" snapOpen open={!answered && optionsReady}>
                    <UserTray>
                      <QuestionInput
                        step={step}
                        open={!answered && optionsReady}
                        onSubmit={(v) => onAnswer(i, v)}
                      />
                    </UserTray>
                  </Reveal>
                )}
              </div>
            );
          }

          return null;
        })}

        {typing && <TypingBubble />}

        {/* 스크롤 기준 마커 — 선지 생성 시 이 지점을 채팅창 바닥에 맞춰 선지가 보이도록 스크롤한다. */}
        <div ref={optionsEndRef} aria-hidden />

        {/* 마지막 단계 — 확인 후 전달 (연락처는 묻지 않는다) */}
        {review && (
          <div className="space-y-2">
            <SystemBubble>
              <Em>거의 다 왔어요!</Em>
              <br />
              작성하신 내용을 {multi ? "작가님들께" : "작가님께"} 그대로 전달할게요.
            </SystemBubble>
            {!done && (
              <SubmitBlock
                onSubmit={submit}
                pending={pending}
                serverError={state.error}
                multi={multi}
                needLogin={!!state.needLogin}
                loginNext={selfUrl}
              />
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* item3 — 완료 모달 (닫기 불가). 단건은 채팅방으로 이동하므로 묶음 상담에서만. */}
      {done && multi && <DoneModal onExplore={goExplore} onSave={goSave} />}
    </div>
  );

  function onBack() {
    // 뒤로가기 = 명시적 이탈 — 어느 질문에서 나갔는지 남기고 이동(언마운트 중복은 가드로 방지).
    trackAbandon("back");
    // item1 — detail→inquiry→detail 흐름에서 history 중복을 만들지 않도록 back 우선.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(photoId ? `/photos/${photoId}` : "/");
  }
}

// ── 완료 모달 (item3) — 묶음 상담 전용 ────────────────────────────
function DoneModal({ onExplore, onSave }: { onExplore: () => void; onSave: () => void }) {
  // 마운트 시 팝인 — 완료를 여정의 Peak 로
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const nextSteps = ["보통 1시간 내 답변드려요", "채팅에서 일정·컨셉을 협의해요"];
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-6 font-kr">
      <div
        className={`w-full max-w-sm rounded-3xl bg-bg p-7 text-center shadow-pop transition-all duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${
          shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div
          className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand/10 text-brand transition-transform duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] ${
            shown ? "scale-100" : "scale-0"
          }`}
        >
          <CheckIcon className="h-7 w-7" />
        </div>
        <p className="text-xl font-bold">신청 접수 완료!</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          작가님들이 사매 채팅으로
          <br />
          답변을 보내드려요.
        </p>

        {/* 다음 일 타임라인 — '끝'이 아니라 '다음'을 보여줘 안심 */}
        <ol className="mt-5 space-y-2.5 text-left">
          {nextSteps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                {i + 1}
              </span>
              <span className="text-sm text-fg/80">{s}</span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onExplore}
          className="mt-6 block w-full cursor-pointer rounded-2xl bg-brand py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
        >
          더 많은 사진 탐색하기
        </button>
        <button
          type="button"
          onClick={onSave}
          className="mt-2.5 block w-full cursor-pointer rounded-2xl border border-line py-3.5 text-base font-semibold text-fg transition-colors hover:bg-surface-2"
        >
          문의 내역 보러가기
        </button>
      </div>
    </div>
  );
}

// ── 마지막 단계 — 확인 후 전달 ────────────────────────────────────
// 연락처 입력이 사라진 자리. 여기서 묻지 않는 이유(비공개·채팅 진행)를 먼저 말해준다.
function SubmitBlock({
  onSubmit,
  pending,
  serverError,
  multi,
  needLogin,
  loginNext,
}: {
  onSubmit: () => void;
  pending: boolean;
  serverError?: string;
  multi: boolean;
  /** 제출을 눌렀는데 로그인이 안 돼 있는 경우 — 이 자리에서 바로 받는다 */
  needLogin?: boolean;
  loginNext: string;
}) {
  return (
    <div className="ml-auto w-full max-w-[88%] rounded-2xl rounded-tr-md bg-brand/[0.07] p-3">
      <p className="flex items-center gap-1.5 text-[11px] leading-tight text-muted">
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
        연락처는 작가에게 공개되지 않아요. 대화는 사매 채팅에서 이어집니다.
      </p>

      {serverError && <p className="mt-2 text-xs font-medium text-danger">{serverError}</p>}

      {needLogin ? (
        // 마지막 한 걸음 — 여기까지 다 적은 사람이다. 페이지를 옮기지 않고 그대로 로그인만 받는다.
        // 적은 내용은 이 기기에 남아 있어서, 돌아오면 그 자리에서 이어진다.
        <div className="mt-3">
          <p className="mb-2 text-body-sm font-semibold text-fg">
            마지막으로 로그인만 하면 전달돼요
          </p>
          <p className="mb-3 text-caption leading-relaxed text-muted">
            작가님 답변을 받을 곳이 필요해서예요. 적으신 내용은 그대로 남아 있어요.
          </p>
          <KakaoLoginButton
            next={loginNext}
            context="inquiry_submit"
            label="카카오로 로그인하고 문의 보내기"
          />
          <p className="mt-2 text-center text-caption text-faint">
            가입돼 있지 않아도 이 버튼 하나로 시작돼요
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-brand text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "전달 중…" : multi ? "작가님들께 문의 보내기" : "작가님께 문의 보내기"}
        </button>
      )}

      {/* 동의 간주 고지 — 버튼 클릭이 개인정보 수집·이용 동의를 갈음 */}
      <p className="mt-2 break-keep text-center text-[11px] leading-relaxed text-faint">
        문의 보내기를 누르면 상담을 위한
        <br />
        <Link
          href="/privacy"
          target="_blank"
          className="underline underline-offset-2 hover:text-muted"
        >
          개인정보 수집·이용
        </Link>
        에 동의하는 것으로 간주됩니다.
      </p>
    </div>
  );
}

// ── 질문별 맞춤 입력 (item2) ──────────────────────────────────────
function QuestionInput({
  step,
  value,
  onSubmit,
  onCancel,
  open = true,
}: {
  step: Step;
  value?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  open?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {step.type === "options" && (
        <OptionGrid
          options={step.options!}
          skip={step.skip}
          cols={step.cols ?? 2}
          value={value}
          onPick={onSubmit}
          open={open}
        />
      )}
      {step.type === "date" && (
        <DateField skip={step.skip} value={value} onPick={onSubmit} />
      )}
      {step.type === "text" && (
        <TextField skip={step.skip} value={value} onPick={onSubmit} />
      )}
      {onCancel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
          >
            수정 취소
          </button>
        </div>
      )}
    </div>
  );
}

// 자유 입력 — 작가 커스텀 질문(선택지가 없는 질문)용. 소프트스킵은 선택지 버튼과 동일 취급.
function TextField({
  skip,
  value,
  onPick,
}: {
  skip: string;
  value?: string;
  onPick: (v: string) => void;
}) {
  const [text, setText] = useState(value && value !== skip ? value : "");
  const trimmed = text.trim();
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 300))}
        rows={3}
        placeholder="자유롭게 적어주세요"
        className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-fg outline-none transition-colors placeholder:text-faint focus:border-brand"
      />
      <button
        type="button"
        onClick={() => trimmed && onPick(trimmed)}
        disabled={!trimmed}
        className="h-11 w-full cursor-pointer rounded-xl bg-brand text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        답변 보내기
      </button>
      <div className="grid">
        <OptionButton active={value === skip} onClick={() => onPick(skip)}>
          {skip}
        </OptionButton>
      </div>
    </div>
  );
}

// 모든 선택지(소프트 스킵 포함) 동등 버튼 (item4) — 다크모드 안전 토큰 (item11)
function OptionButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        // 중성 자립형(모바일·호버 없음) — 어포던스는 solid 표면+뚜렷한 라인 테두리+살짝 그림자로,
        // 색은 선택 시에만 brand. 탭 피드백은 active 스케일.
        "cursor-pointer rounded-xl px-3.5 py-3 text-[15px] font-medium transition-transform active:scale-[0.97]",
        active
          ? "bg-brand text-white"
          : "bg-surface text-fg ring-1 ring-line-strong active:bg-surface-2",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function OptionGrid({
  options,
  skip,
  cols = 2,
  value,
  onPick,
  open = true,
}: {
  open?: boolean;
  options: string[];
  skip: string;
  cols?: 1 | 2;
  value?: string;
  onPick: (v: string) => void;
}) {
  // 열릴 때(open) 각 버튼이 아래→위로 '떠오르듯' 등장 — 맨 아래(마지막) 버튼부터 먼저(지연 역순).
  // 마운트가 아니라 open 전환에 맞춰 재생 → 접혀있는 동안 미리 애니가 소진되지 않게.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  const items = [...options, skip];
  return (
    <div className={`grid gap-2 ${cols === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {items.map((opt, idx) => {
        const delay = (items.length - 1 - idx) * 40; // 맨 아래=0, 위로 갈수록 지연
        // 2열인데 항목이 홀수라 마지막(건너뛰기)이 혼자 남으면 그 줄을 전체 너비로.
        const spanFull = cols === 2 && items.length % 2 === 1 && idx === items.length - 1;
        return (
          // grid 래퍼 — 버튼이 셀을 꽉 채우게 유지하면서 래퍼에 등장 트랜지션 적용
          <div
            key={opt}
            className={`grid ${spanFull ? "col-span-2" : ""}`}
            style={{
              opacity: shown ? 1 : 0,
              transform: shown ? "translateY(0)" : "translateY(10px)",
              transition: `opacity 240ms ease ${delay}ms, transform 260ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
            }}
          >
            <OptionButton active={value === opt} onClick={() => onPick(opt)}>
              {opt}
            </OptionButton>
          </div>
        );
      })}
    </div>
  );
}

// 날짜 — 빠른 칩 + "날짜 직접 선택" → 핸들 달린 바텀시트(캘린더 바로 노출, item2)
function DateField({
  skip,
  value,
  onPick,
}: {
  skip: string;
  value?: string;
  onPick: (v: string) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const quick = ["2주 이내", "한 달 이내"];
  const pickedDate = value && isISODate(value) ? value : "";

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {quick.map((q) => (
        <OptionButton key={q} active={value === q} onClick={() => onPick(q)}>
          {q}
        </OptionButton>
      ))}
      <OptionButton active={!!pickedDate} onClick={() => setSheet(true)}>
        {pickedDate ? formatDateKo(pickedDate) : "날짜 직접 선택"}
      </OptionButton>
      <OptionButton active={value === skip} onClick={() => onPick(skip)}>
        {skip}
      </OptionButton>
      {sheet && (
        <DateSheet
          value={pickedDate}
          onClose={() => setSheet(false)}
          onConfirm={(iso) => {
            setSheet(false);
            onPick(iso);
          }}
        />
      )}
    </div>
  );
}

// 핸들 달린 바텀시트 — 아래에서 올라오고 캘린더가 바로 보임
function DateSheet({
  value,
  onClose,
  onConfirm,
}: {
  value: string;
  onClose: () => void;
  onConfirm: (iso: string) => void;
}) {
  const [sel, setSel] = useState(value && isISODate(value) ? value : "");
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  function close() {
    setShown(false);
    window.setTimeout(onClose, 250);
  }
  return (
    <div className="fixed inset-0 z-[80] font-kr">
      <div
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl bg-bg px-5 pb-9 pt-4 shadow-pop transition-transform duration-300 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-fg/15" />
          <p className="mb-4 text-center text-base font-semibold">촬영 희망일 선택</p>
          <Calendar value={sel} onSelect={setSel} />
          <button
            type="button"
            onClick={() => sel && onConfirm(sel)}
            disabled={!sel}
            className="mt-5 h-12 w-full cursor-pointer rounded-xl bg-brand text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            이 날짜로 선택
          </button>
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

// 월 단위 캘린더 — 오늘 이전은 비활성, 선택일 브랜드 강조
function Calendar({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = value && isISODate(value) ? new Date(`${value}T00:00:00`) : today;
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });

  const startDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const atCurrentMonth = view.y === today.getFullYear() && view.m === today.getMonth();
  const isPastMonth =
    view.y < today.getFullYear() || (view.y === today.getFullYear() && view.m < today.getMonth());

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const iso = (d: number) =>
    `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function shift(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atCurrentMonth || isPastMonth}
          aria-label="이전 달"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
        >
          ‹
        </button>
        <span className="text-base font-semibold tabular-nums">
          {view.y}년 {view.m + 1}월
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="다음 달"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06]"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAY_SHORT.map((w, i) => (
          <div
            key={w}
            className={`py-1 text-center text-xs font-medium ${
              i === 0 ? "text-danger" : "text-muted"
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const dayDate = new Date(view.y, view.m, d);
          const past = dayDate < today;
          const selected = value === iso(d);
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              onClick={() => onSelect(iso(d))}
              className={[
                "mx-auto grid h-9 w-9 place-items-center rounded-full text-sm tabular-nums transition-colors",
                selected
                  ? "bg-brand font-semibold text-white"
                  : past
                    ? "cursor-not-allowed text-faint/40"
                    : "cursor-pointer text-fg hover:bg-brand/[0.08]",
              ].join(" ")}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 공통 말풍선/유틸 ──────────────────────────────────────────────
function UserTray({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto mt-2 w-full max-w-[92%]">{children}</div>
  );
}

function SystemBubble({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        "mr-auto max-w-[88%] rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[17px] leading-relaxed text-fg transition-colors",
        emphasis ? "bg-brand/[0.08] ring-1 ring-brand/25" : "bg-surface-2",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function SentBubble({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={[
        "w-fit rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[17px] font-medium",
        // 수정 중: 강조된 질문 말풍선과 동일한 배경(브랜드 틴트 + 링) — 라이트/다크 모두 읽히는 적응형 텍스트
        muted ? "bg-brand/[0.08] text-brand-ink ring-1 ring-brand/25" : "bg-brand text-white",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function TypingBubble() {
  // 높이·패딩을 SystemBubble(px-3.5 py-2.5 text-[17px] leading-relaxed, 약 2.9rem)과 맞춤
  return (
    <div className="mr-auto flex min-h-[2.9rem] max-w-[88%] items-center gap-1 rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5">
      <Dot /> <Dot /> <Dot />
    </div>
  );
}
function Dot() {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg/40" />;
}

// 높이 0→auto 부드러운 펼침 (grid-rows 트릭)
// snapOpen: 열릴 땐 높이를 즉시 확보(클립 없이) → 내부 버튼이 아래→위 스태거로 '떠오르게',
//           닫힐 땐 부드럽게 collapse. (일반 Reveal 은 양방향 부드럽게 — 질문·답변칩·날짜·노트)
function Reveal({
  open,
  snapOpen = false,
  children,
}: {
  open: boolean;
  snapOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"} ${
        open && snapOpen ? "" : "transition-[grid-template-rows] duration-300"
      }`}
    >
      {/* px-0.5: overflow-hidden 우측 클립 경계에 입력 border(포커스 시 brand)가 살짝 잘리던 것 방지 */}
      <div className="overflow-hidden px-0.5 pb-1">{children}</div>
    </div>
  );
}

// 마운트 시 0→1 로 펼쳐지며 등장
function ExpandIn({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return <Reveal open={open}>{children}</Reveal>;
}
