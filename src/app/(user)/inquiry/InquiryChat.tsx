"use client";

/* eslint-disable @next/next/no-img-element */
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon } from "@/components/user/icons";
import { mpTrack } from "@/lib/mixpanel";
import { submitInquiry, submitMultiInquiry, type InquiryState } from "./actions";

const INITIAL_STATE: InquiryState = { ok: false };

// 채팅형 문의 — 스크롤되는 채팅방. 시스템이 질문을 보내고, 사용자는 질문별 맞춤 입력으로 답함.
// soft-skip은 다른 선택지와 동등한 버튼. 언제든 "바로 문의" 경로 → 건너뛴 질문은 접이식 아코디언.
// 제출 전까진 이전 답변 언제든 수정(답변 칩 유지 + 선택지 부드럽게 펼침).

type StepKey = "purpose" | "preferredDate" | "region" | "partySize" | "gender" | "note" | "name";
type StepType = "options" | "date" | "note" | "text";

type Step = {
  key: StepKey;
  q: React.ReactNode;
  type: StepType;
  options?: string[];
  cols?: 1 | 2; // options 레이아웃 (기본 2열)
  placeholder?: string; // text 입력 placeholder
  skip: string; // 질문별 맞춤 soft-skip (다른 선택지와 동등 버튼)
  short: string; // 요약 라벨
};

const STEPS: Step[] = [
  {
    key: "purpose",
    q: "어떤 사진 촬영을 원하시나요?",
    type: "options",
    options: ["커플·우정 스냅", "웨딩·본식", "개인·프로필", "가족", "행사·기타"],
    skip: "아직 고민 중이에요",
    short: "촬영 종류",
  },
  {
    key: "preferredDate",
    q: (
      <>
        촬영 <Em>희망일</Em>을 선택해주세요.
      </>
    ),
    type: "date",
    skip: "날짜는 미정이에요",
    short: "희망일",
  },
  {
    key: "region",
    q: (
      <>
        <Em>지역</Em>을 선택해주세요.
      </>
    ),
    type: "options",
    options: ["서울", "경기·인천", "부산·경남", "대구·경북", "대전·충청", "광주·전라", "제주"],
    skip: "협의 후 결정",
    short: "지역",
  },
  {
    key: "partySize",
    q: (
      <>
        <Em>몇 분</Em>이 함께 찍으시나요?
      </>
    ),
    type: "options",
    options: ["1명", "2명", "3~6명", "그 이상"],
    cols: 1,
    skip: "미정",
    short: "인원",
  },
  {
    key: "gender",
    q: (
      <>
        문의자분 <Em>성별</Em>을 알려주세요.
      </>
    ),
    type: "options",
    options: ["남성", "여성"],
    cols: 2,
    skip: "밝히지 않을게요",
    short: "성별",
  },
  {
    key: "note",
    q: (
      <>
        촬영 관련 <Em>문의사항</Em>을 알려주세요!
      </>
    ),
    type: "note",
    skip: "작가님과 상담 시 논의할게요",
    short: "문의사항",
  },
  {
    key: "name",
    q: (
      <>
        작가님이 어떻게 <Em>불러드리면</Em> 될까요?
      </>
    ),
    type: "text",
    placeholder: "성함 또는 닉네임",
    skip: "이름 없이 문의할게요",
    short: "이름",
  },
];

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
// 저장값 → 화면 표시 문자열
function displayAnswer(key: StepKey, value: string) {
  if (key === "preferredDate" && isISODate(value)) return formatDateKo(value);
  return value;
}

// 입력 중인 답변을 사진별로 보존 (새로고침·뒤로가기 후 복원)
function inquiryStorageKey(photoId: string, photographerId: string) {
  return `samae:inquiry:${photoId || photographerId}`;
}
function loadSavedAnswers(key: string): Partial<Record<StepKey, string>> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Partial<Record<StepKey, string>>;
  } catch {
    /* 무시 */
  }
  return null;
}

// ── 연락처 타입 / 유효성 (item9) ─────────────────────────────────
type ContactType = "phone" | "kakao" | "email";
const CONTACT_TYPES: {
  key: ContactType;
  label: string;
  short: string; // 아이콘 아래 짧은 라벨
  placeholder: string;
  inputMode: "tel" | "text" | "email";
  empty: string; // 빈칸일 때 안내문
}[] = [
  { key: "phone", label: "전화번호", short: "전화", placeholder: "010-1234-5678", inputMode: "tel", empty: "전화번호를 입력해주세요." },
  { key: "kakao", label: "카카오톡 ID", short: "카톡", placeholder: "카카오톡 ID", inputMode: "text", empty: "카카오톡 ID를 입력해주세요." },
  { key: "email", label: "이메일", short: "이메일", placeholder: "photosame00@gmail.com", inputMode: "email", empty: "이메일 주소를 입력해주세요." },
];

// 연락처 방식 아이콘 (전화 / 인스타 / 이메일)
function ContactIcon({ kind }: { kind: ContactType }) {
  const cls = "h-5 w-5";
  if (kind === "phone")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M4 5c0-.6.4-1 1-1h2.3c.5 0 .9.3 1 .8l.8 3c.1.4 0 .8-.3 1.1L7.3 10.4a12 12 0 0 0 6.3 6.3l1.5-1.5c.3-.3.7-.4 1.1-.3l3 .8c.5.1.8.5.8 1V19c0 .6-.4 1-1 1A15 15 0 0 1 4 5z"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (kind === "kakao")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M12 4.5C7 4.5 3 7.6 3 11.4c0 2.4 1.7 4.6 4.2 5.8-.2.7-.7 2.3-.8 2.7 0 .3.2.4.4.3.3-.2 2.5-1.7 3.5-2.4.5.1 1.1.1 1.7.1 5 0 9-3.1 9-6.9S17 4.5 12 4.5z"
          strokeLinejoin="round"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 5.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 카카오톡 아이디 — 영문 소문자·숫자·마침표(.)·밑줄(_) 4~20자 (대문자·하이픈 불가)
const KAKAO_RE = /^[a-z0-9._]{4,20}$/;

// 전화번호 — "-" 없이 입력해도 자동으로 하이픈 삽입 (item5)
function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
// 카톡 ID — 소문자만 허용: 대문자는 자동 소문자화, 허용 외 문자(하이픈·공백 등)는 제거, 20자 캡
function formatKakaoInput(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20);
}

// 입력창 흔들림 — 미완성 제출 시 "여기 입력해주세요" 시선 유도
function shakeEl(el: HTMLElement | null) {
  el?.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(4px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 320, easing: "ease-in-out" }
  );
}

function validateContact(type: ContactType, raw: string): { valid: boolean; error: string | null } {
  const v = raw.trim();
  if (!v) return { valid: false, error: null };
  if (type === "phone") {
    const d = v.replace(/\D/g, "");
    if (d.length !== 11 || !d.startsWith("01"))
      return { valid: false, error: "010으로 시작하는 11자리를 입력해주세요." };
    return { valid: true, error: null };
  }
  if (type === "kakao") {
    if (!KAKAO_RE.test(v)) return { valid: false, error: "4자 이상 입력해주세요." };
    return { valid: true, error: null };
  }
  if (!EMAIL_RE.test(v))
    return { valid: false, error: "올바른 이메일 형식이 아니에요. 예: id@gmail.com" };
  return { valid: true, error: null };
}

export function InquiryChat({
  photographerId,
  photoId,
  photoSrc,
  photoIds,
  photoSrcs,
}: {
  photographerId: string;
  photoId: string;
  photoSrc: string | null;
  // 찜에서 여러 장 묶음 상담(작가별 dedup은 서버에서). 있으면 멀티 모드.
  photoIds?: string[];
  photoSrcs?: string[];
}) {
  const router = useRouter();
  const multi = !!photoIds && photoIds.length > 0;
  const [state, formAction, pending] = useActionState(
    multi ? submitMultiInquiry : submitInquiry,
    INITIAL_STATE
  );

  const [answers, setAnswers] = useState<Partial<Record<StepKey, string>>>({});
  const [revealed, setRevealed] = useState(-1); // 노출된 질문 최대 index
  const [typing, setTyping] = useState(false);
  const [optionsReady, setOptionsReady] = useState(false); // 질문 노출 후 1초 뒤 선지 노출
  const [contactStep, setContactStep] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // 재선택 중인 질문 index

  const bottomRef = useRef<HTMLDivElement>(null);
  const optionsEndRef = useRef<HTMLDivElement>(null); // 선지+건너뛰기 하단 — 생성 시 채팅창 바닥에 맞춤
  const started = useRef(false);

  // 문의 위저드 진입 — 마운트당 1회 (문의 시작 → 제출 전환율 측정)
  const startFired = useRef(false);
  useEffect(() => {
    if (startFired.current) return;
    startFired.current = true;
    mpTrack("Start Inquiry", {
      source: multi ? "cart" : "photo",
      photographer_id: photographerId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storageKey = multi
    ? `samae:inquiry:cart:${(photoIds ?? []).slice(0, 3).join("_")}`
    : inquiryStorageKey(photoId, photographerId);
  const answeredCount = STEPS.filter((s) => answers[s.key] !== undefined).length;
  const done = state.ok;
  // 진행률 = 답변한 질문 수 / 전체 질문 수. 연락처는 '결승선'이라 질문 카운트에 미포함.
  const totalQ = STEPS.length;
  const answeredQ = Math.min(answeredCount, totalQ);

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
  function revealContact() {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setContactStep(true);
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
    // 사진별로 저장된 입력이 있으면 복원 (새로고침·뒤로가기 후 그대로)
    const saved = loadSavedAnswers(storageKey);
    if (saved && Object.keys(saved).length > 0) {
      const cnt = STEPS.filter((s) => saved[s.key] !== undefined).length;
      window.setTimeout(() => {
        setAnswers(saved);
        if (cnt >= STEPS.length) {
          setRevealed(STEPS.length - 1);
          setContactStep(true);
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

  // 스크롤은 오직 '선지가 생성될 때'만 — 선지의 맨 아래가 채팅창 바닥에 붙도록(block:"end").
  // 답변(선지 접힘)·타이핑·질문 등장 시엔 스크롤하지 않아 기존 채팅이 그대로 있는다.
  useEffect(() => {
    if (!optionsReady) return;
    optionsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [optionsReady]);

  // 연락처·완료 단계 진입 시엔 폼/모달이 보이게 하단으로.
  useEffect(() => {
    if (contactStep || done) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [contactStep, done]);

  // 성공 — Lead 픽셀 발화(중복 제거 eventID)
  const leadFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state.ok || !state.inquiryId) return;
    if (leadFiredFor.current !== state.inquiryId) {
      leadFiredFor.current = state.inquiryId;
      window.fbq?.("track", "Lead", {}, { eventID: `inquiry_${state.inquiryId}` });
      mpTrack("Submit Inquiry", {
        inquiry_id: state.inquiryId,
        source: multi ? "cart" : "photo",
        photographer_id: photographerId,
        item_count: multi ? photoIds?.length ?? 1 : 1,
        // 위저드 답변(수요 차원 — 촬영목적·지역·인원·희망일). note(자유서술)는 제외.
        purpose: answers.purpose,
        region: answers.region,
        party_size: answers.partySize,
        preferred_date: answers.preferredDate,
      });
    }
    // 답변·모드는 제출 성공 시점 값으로 1회만 기록 — leadFiredFor 가드로 중복 방지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.inquiryId]);

  function onAnswer(i: number, value: string) {
    const key = STEPS[i].key;
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (editing === i) {
      setEditing(null);
      return;
    }
    // item9 — 맨 아래(현재) 질문에 답하면 진행 중이던 수정도 자동으로 닫힘
    if (editing !== null) setEditing(null);
    if (i === revealed) {
      if (i < STEPS.length - 1) advanceTo(i + 1);
      else revealContact();
    }
  }

  // 제출 — 채팅 답변 + 연락처를 FormData 로 변환해 기존 submitInquiry 재사용
  function submit(contactType: ContactType, contactValue: string) {
    const fd = new FormData();
    if (multi) {
      fd.set("photoIds", (photoIds ?? []).join(","));
    } else {
      fd.set("photographerId", photographerId);
      fd.set("photoId", photoId);
    }
    for (const s of STEPS) {
      const raw = answers[s.key];
      if (!raw) {
        fd.set(s.key, "");
        continue;
      }
      // partySize·gender·name 은 soft-skip 을 값으로 저장하지 않고 미입력(null)로 처리
      if ((s.key === "partySize" || s.key === "gender" || s.key === "name") && raw === s.skip) {
        fd.set(s.key, "");
        continue;
      }
      fd.set(s.key, displayAnswer(s.key, raw));
    }
    if (contactType === "phone") {
      const d = contactValue.replace(/\D/g, "");
      fd.set("phone", `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`);
    } else if (contactType === "kakao") {
      fd.set("kakaoId", contactValue.trim());
    } else {
      fd.set("contactEmail", contactValue.trim());
    }
    startTransition(() => formAction(fd));
  }

  // item10 — 완료 모달 동선
  function goExplore() {
    try {
      sessionStorage.removeItem(POST_INQUIRY_KEY);
    } catch {
      /* 무시 */
    }
    router.replace("/");
  }
  function goSave() {
    // 완료 후 문의 내역으로 — 비로그인도 쿠키로 조회 가능(죽은 /bookings 대신 /my-inquiries).
    // POST_INQUIRY_KEY 는 유지 → 내역에서 '뒤로' 시 빈 폼 대신 탐색으로 바운스.
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
            <p className="text-base font-semibold">무료 상담 신청</p>
            <p className="text-sm text-muted">보통 1시간 내 답변드려요</p>
          </div>
        </div>
        <div className="px-4 pb-3 pt-2">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-fg">
              {contactStep ? "마지막 단계 · 연락처" : STEPS[answeredQ]?.short ?? "질문"}
            </span>
            <span className="text-sm font-bold tabular-nums text-brand">
              {contactStep ? "거의 끝났어요!" : `${answeredQ} / ${totalQ}`}
            </span>
          </div>
          {/* 연결된 도트 스텝퍼 — 완료=체크, 현재=핑(ping) 강조, 미완성=작은 점(크기 리듬) */}
          <div className="flex items-center py-1">
            {Array.from({ length: totalQ }).map((_, i) => {
              const isDone = i < answeredQ;
              const isCurrent = i === answeredQ && !contactStep && !done;
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
          </div>
        </div>
      </header>

      {/* 채팅 본문 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
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
            photoSrc && <img src={photoSrc} alt="문의한 사진" className="mb-2 w-full rounded-xl" />
          )}
          짧게 몇 가지만 알려주시면
          <br />
          {multi ? (
            <>
              선택한 사진의 <Em>작가님들과 연결</Em>해드려요.
            </>
          ) : (
            <>
              사진을 찍은 <Em>작가님과 연결</Em>해드려요.
            </>
          )}
        </SystemBubble>

        {/* 질문/답변 */}
        {STEPS.map((step, i) => {
          const answered = answers[step.key] !== undefined;
          const isEditing = editing === i;

          // item4/5/6 — 수정 중: 질문 강조 + 답변 칩 유지 + 선택지 부드럽게 펼침
          if (isEditing) {
            return (
              <div key={step.key} className="space-y-1.5">
                <SystemBubble emphasis>{step.q}</SystemBubble>
                {answered && (
                  <div className="ml-auto w-fit max-w-[88%]">
                    <SentBubble muted>{displayAnswer(step.key, answers[step.key]!)}</SentBubble>
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
          if (answered || (!contactStep && i === revealed)) {
            return (
              <div key={step.key} className="space-y-1.5">
                <ExpandIn key="q">
                  <SystemBubble>{step.q}</SystemBubble>
                </ExpandIn>
                {answered && (
                  <ExpandIn key="a">
                    <div className="ml-auto flex w-fit max-w-[88%] flex-col items-end gap-0.5">
                      <SentBubble>{displayAnswer(step.key, answers[step.key]!)}</SentBubble>
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
                {i === revealed && !contactStep && (
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

        {/* 연락처 단계 (item9) */}
        {contactStep && (
          <div className="space-y-2">
            <SystemBubble>
              <Em>마지막 단계</Em>예요!
              <br />
              작가님이 직접 연락드릴 수 있도록
              <br />
              <Em>연락받을 방법</Em> 하나만 남겨주세요.
            </SystemBubble>
            {!done && (
              <ContactBlock onSubmit={submit} pending={pending} serverError={state.error} />
            )}
          </div>
        )}

        {/* 하단 여백 스페이서 — 선지가 접힐 때 콘텐츠가 짧아져도 스크롤이 위로 튕기지(clamp) 않게
            버퍼를 상시 확보(선지 최대 높이보다 큼). 연락처·완료 단계에선 불필요(빈공간만 크게
            남음)해서 제외한다. */}
        {!contactStep && !done && <div aria-hidden className="h-[65vh]" />}
        <div ref={bottomRef} />
      </div>

      {/* item3 — 완료 모달 (닫기 불가) */}
      {done && <DoneModal onExplore={goExplore} onSave={goSave} />}
    </div>
  );

  function onBack() {
    // item1 — detail→inquiry→detail 흐름에서 history 중복을 만들지 않도록 back 우선.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(photoId ? `/photos/${photoId}` : "/");
  }
}

// ── 완료 모달 (item3) ─────────────────────────────────────────────
function DoneModal({ onExplore, onSave }: { onExplore: () => void; onSave: () => void }) {
  // 마운트 시 팝인 — 완료를 여정의 Peak 로
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const nextSteps = ["작가님이 신청을 확인해요", "보통 1시간 내 연락드려요", "채팅에서 일정·컨셉을 협의해요"];
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
          곧 작가님으로부터 연락이 도착합니다.
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

// ── 연락처 입력 (item9) ───────────────────────────────────────────
function ContactBlock({
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
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [kakaoHelp, setKakaoHelp] = useState(false); // '카톡 아이디 찾는 방법' 펼침
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const blockTimer = useRef<number | undefined>(undefined);

  const active = CONTACT_TYPES.find((t) => t.key === type);
  const check = type ? validateContact(type, val) : { valid: false, error: null };
  const errorText = check.valid
    ? null
    : val.trim()
      ? check.error
      : (active?.empty ?? "연락받을 연락처를 입력해주세요.");
  // 안내문: blur/버튼 시 검증 노출 + 허용 외 문자 입력 시 즉시(blockMsg) 노출
  const showError = attempted && !!errorText;
  const displayedError = blockMsg ?? (showError ? errorText : null);

  // 허용 외 문자 입력 시 즉시 안내 (입력 자체는 차단)
  function flashBlock(msg: string) {
    setBlockMsg(msg);
    if (blockTimer.current) window.clearTimeout(blockTimer.current);
    blockTimer.current = window.setTimeout(() => setBlockMsg(null), 2200);
  }
  function handleChange(raw: string) {
    if (type === "phone") {
      if (/[^\d\s().-]/.test(raw)) flashBlock("숫자만 입력할 수 있어요.");
      setVal(formatPhoneInput(raw));
    } else if (type === "kakao") {
      // 대문자는 조용히 소문자화 → 안내는 진짜 못 쓰는 문자(하이픈·공백·한글 등)에만
      if (/[^a-zA-Z0-9._]/.test(raw)) flashBlock("영문·숫자·_·.만 쓸 수 있어요.");
      setVal(formatKakaoInput(raw));
    } else {
      setVal(raw);
    }
  }
  useEffect(() => () => window.clearTimeout(blockTimer.current), []);

  // 연락처 종류 선택 시 채팅 스크롤을 최하단까지 내려 입력창·버튼이 보이게
  useEffect(() => {
    if (!type) return;
    const id = window.setTimeout(() => {
      const sc = endRef.current?.closest<HTMLElement>(".overflow-y-auto");
      if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
      else endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [type]);

  function handleSubmit() {
    setAttempted(true);
    if (!type || !check.valid) {
      // 연락처 미완성 — 입력창으로 시선 유도(포커스 + 흔들림)
      inputRef.current?.focus();
      shakeEl(inputRef.current);
      return;
    }
    onSubmit(type, val);
  }

  return (
    <>
    <div className="ml-auto w-full max-w-[88%] rounded-2xl rounded-tr-md bg-brand/[0.07] p-3">
      <div className="grid grid-cols-3 gap-2">
        {CONTACT_TYPES.map((t) => {
          const on = type === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              aria-label={t.label}
              onClick={() => {
                setType(t.key);
                setVal("");
                setAttempted(false);
                setBlockMsg(null);
                setKakaoHelp(false);
              }}
              className={[
                // 아이콘 + 짧은 라벨 세로 스택 — '인스타 DM' 처럼 긴 라벨로 줄바꿈되던 문제 해소
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium transition-transform active:scale-[0.97]",
                on ? "bg-brand text-white" : "bg-surface text-fg ring-1 ring-line-strong active:bg-surface-2",
              ].join(" ")}
            >
              <ContactIcon kind={t.key} />
              {t.short}
            </button>
          );
        })}
      </div>

      {/* 연락처 안심 — 왜 필요한지 + 노출 범위(이탈 최다 지점 방어) */}
      <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-tight text-muted">
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
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
              "h-11 w-full rounded-xl border bg-surface px-3 text-base text-fg outline-none transition-colors placeholder:text-faint",
              displayedError ? "border-danger" : "border-line-strong focus:border-brand",
            ].join(" ")}
          />
          {/* 안내문 자리를 항상 확보 — 등장해도 버튼이 밀리지 않게 */}
          {/* 에러 + 카톡 도움말 토글을 같은 예약 높이(min-h-[18px]) 줄에 —
              연락수단별(전화/카톡/이메일) 입력 박스 높이를 동일하게 유지. 도움말은 탭 시에만 아래로 펼침. */}
          {/* 에러 줄(높이는 에러 텍스트 18px 로만 결정) — 카톡 도움말 토글은 absolute 로 얹어
              줄 높이에 영향 주지 않음 → 전화/카톡/이메일 입력 박스 높이가 항상 동일. */}
          <div className="relative mt-1.5 min-h-[18px]">
            <p
              className={`truncate text-[11px] font-medium leading-[18px] text-danger ${
                type === "kakao" ? "pr-28" : ""
              }`}
            >
              {displayedError ?? ""}
            </p>
            {type === "kakao" && (
              <button
                type="button"
                onClick={() => setKakaoHelp((v) => !v)}
                aria-expanded={kakaoHelp}
                className="absolute right-0 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 text-[11px] font-medium leading-[18px] text-muted transition-colors hover:text-fg"
              >
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px] font-bold leading-none">
                  ?
                </span>
                아이디 찾는 방법
                <ChevronDownIcon
                  className={`h-3 w-3 transition-transform ${kakaoHelp ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>

          {/* 카톡 아이디 찾는 방법 — 열렸을 때만 렌더(닫힘=0 높이 → 전화/이메일과 박스 높이 동일) */}
          {type === "kakao" && kakaoHelp && (
            <div className="mt-2 rounded-xl bg-surface-2 px-3 py-3 text-[12px] leading-relaxed text-fg/80">
                  <ol className="space-y-3">
                    <li>
                      <p className="mb-1.5">
                        <b className="text-fg">1.</b> 카카오톡 <b className="text-fg">친구 탭</b> →
                        우측 상단 <b className="text-fg">친구 추가(사람+)</b> 아이콘
                      </p>
                      <img
                        src="/guide/kakao-id-1.jpg"
                        alt="카카오톡 친구 탭 우측 상단의 친구 추가 아이콘 위치"
                        loading="lazy"
                        className="w-full rounded-lg border border-line"
                      />
                    </li>
                    <li>
                      <p className="mb-1.5">
                        <b className="text-fg">2.</b> 상단에서 <b className="text-fg">카카오톡 ID</b> 선택
                      </p>
                      <img
                        src="/guide/kakao-id-2.jpg"
                        alt="친구 추가 화면의 카카오톡 ID 메뉴"
                        loading="lazy"
                        className="w-full rounded-lg border border-line"
                      />
                    </li>
                    <li>
                      <p className="mb-1.5">
                        <b className="text-fg">3.</b> 하단 <b className="text-fg">‘내 아이디’</b>에
                        표시된 값이 내 카카오톡 아이디예요
                      </p>
                      <img
                        src="/guide/kakao-id-3.jpg"
                        alt="내 카카오톡 아이디가 표시되는 위치"
                        loading="lazy"
                        className="w-full rounded-lg border border-line"
                      />
                    </li>
                  </ol>
            </div>
          )}

          {serverError && <p className="mt-2 text-xs font-medium text-danger">{serverError}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className={[
              "mt-3 h-12 w-full cursor-pointer rounded-xl bg-brand text-base font-semibold text-white transition-opacity",
              check.valid ? "opacity-100 hover:opacity-90" : "opacity-40",
              "disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {pending ? "신청 중…" : "무료 상담 신청하기"}
          </button>

          {/* 동의 간주 고지 — 버튼 클릭이 개인정보 수집·이용 동의를 갈음 */}
          <p className="mt-2 break-keep text-center text-[11px] leading-relaxed text-faint">
            신청하기를 누르면 연락처 전달 및 상담을 위한
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
          <div ref={endRef} />
        </div>
      )}
    </div>
    {/* 박스 밖 하단 여백 — 선택 전엔 입력영역 높이만큼 '공간만' 확보(박스 자체는 안 커짐).
        선택 시 0 → 박스가 입력창만큼 커져도 아래가 안 밀린다. 실제 입력영역보다 살짝 넉넉히. */}
    {!type && <div aria-hidden className="h-[212px]" />}
    </>
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
      {step.type === "note" && (
        <NoteField skip={step.skip} value={value} onPick={onSubmit} />
      )}
      {step.type === "text" && (
        <TextField skip={step.skip} placeholder={step.placeholder} value={value} onPick={onSubmit} />
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
  const quick = ["이번 주말", "2주 이내", "한 달 이내"];
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

// 문의사항 — 두 버튼(상담 시 논의 / 지금 작성). "지금 작성" → 텍스트 (item8)
function NoteField({
  skip,
  value,
  onPick,
}: {
  skip: string;
  value?: string;
  onPick: (v: string) => void;
}) {
  const isCustom = !!value && value !== skip;
  const [writing, setWriting] = useState(isCustom);
  const [t, setT] = useState(isCustom ? value! : "");
  const endRef = useRef<HTMLDivElement>(null);

  // '지금 작성' 진입 시 입력창+보내기 버튼까지 화면에 보이도록 스크롤
  useEffect(() => {
    if (!writing) return;
    const id = window.setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [writing]);

  if (writing) {
    return (
      <div className="space-y-2">
        <textarea
          value={t}
          onChange={(e) => setT(e.target.value)}
          rows={3}
          autoFocus
          placeholder="예: 원하는 분위기, 의상, 시간대, 예산 등 자유롭게 적어주세요"
          // 글로벌 :focus-visible 아웃라인(2px offset)이 unlayered라 유틸보다 우선순위가 높아 안 죽음 →
          // Reveal overflow-hidden 에 우측 잘리던 원인. 인라인 style 로 확실히 차단하고,
          // 포커스 표시는 박스 '안쪽'(border+inset ring)으로 대체.
          style={{ outline: "none" }}
          className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-fg transition-colors placeholder:text-faint focus:border-brand focus:ring-1 focus:ring-inset focus:ring-brand"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setWriting(false)}
            className="cursor-pointer text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-fg hover:underline"
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={() => onPick(t.trim())}
            disabled={!t.trim()}
            className="h-9 cursor-pointer rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            보내기
          </button>
        </div>
        <div ref={endRef} aria-hidden />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-1.5">
      <OptionButton onClick={() => setWriting(true)}>지금 작성할게요</OptionButton>
      <OptionButton active={value === skip} onClick={() => onPick(skip)}>
        {skip}
      </OptionButton>
    </div>
  );
}

// 짧은 텍스트 입력(이름/닉네임) — 입력창 + soft-skip 버튼 + 보내기
function TextField({
  skip,
  placeholder,
  value,
  onPick,
}: {
  skip: string;
  placeholder?: string;
  value?: string;
  onPick: (v: string) => void;
}) {
  const isCustom = !!value && value !== skip;
  const [t, setT] = useState(isCustom ? value! : "");
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={t}
        onChange={(e) => setT(e.target.value)}
        autoFocus
        placeholder={placeholder ?? "입력해주세요"}
        style={{ outline: "none" }}
        className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-fg transition-colors placeholder:text-faint focus:border-brand focus:ring-1 focus:ring-inset focus:ring-brand"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <OptionButton active={value === skip} onClick={() => onPick(skip)}>
          {skip}
        </OptionButton>
        <button
          type="button"
          onClick={() => onPick(t.trim())}
          disabled={!t.trim()}
          className="cursor-pointer rounded-xl bg-brand px-3.5 py-3 text-[15px] font-medium text-white transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          보내기
        </button>
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
