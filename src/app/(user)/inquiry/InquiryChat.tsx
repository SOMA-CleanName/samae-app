"use client";

/* eslint-disable @next/next/no-img-element */
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@/components/user/icons";
import { submitInquiry, type InquiryState } from "./actions";

const INITIAL_STATE: InquiryState = { ok: false };

// 채팅형 문의 — 한 화면 한 질문이 아니라 스크롤되는 채팅방.
// 시스템이 진입 사진을 보내고 → 0.5초 뒤 질문 도착 → 사용자 말풍선에 선택 버튼.
// 선택형은 버튼, 연락처만 텍스트. 각 질문에 소프트 스킵 + 언제든 바로 연락처 경로.
// 제출 전까진 이전 답변(버튼) 언제든 수정 가능.

type StepKey = "purpose" | "preferredDate" | "region" | "partySize" | "note";

const STEPS: { key: StepKey; q: string; options: string[] }[] = [
  {
    key: "purpose",
    q: "어떤 촬영을 찾고 계세요?",
    options: ["커플·우정 스냅", "웨딩·본식", "개인·프로필", "가족", "행사·기타"],
  },
  {
    key: "preferredDate",
    q: "언제쯤 찍고 싶으세요?",
    options: ["이번 주말", "2주 이내", "한 달 이내", "날짜는 미정"],
  },
  {
    key: "region",
    q: "어느 지역에서 촬영하실 건가요?",
    options: ["서울", "경기·인천", "부산·경남", "대구·경북", "대전·충청", "광주·전라", "제주", "온라인 협의"],
  },
  {
    key: "partySize",
    q: "몇 분이 함께 찍으시나요?",
    options: ["1명", "2명", "3~4명", "5명 이상"],
  },
  {
    key: "note",
    q: "원하는 분위기가 있다면 골라주세요.",
    options: ["자연스러운 무드", "화보 느낌", "빈티지·필름", "발랄·러블리", "작가님께 맡길게요"],
  },
];

const SOFT_SKIP = ["모르겠어요", "아직 못 정했어요", "작가님과 상의 후 정할게요"];
const PARTY_MAP: Record<string, string> = { "1명": "1", "2명": "2", "3~4명": "4", "5명 이상": "5" };
const REVEAL_MS = 500;

export function InquiryChat({
  photographerId,
  photoId,
  photoSrc,
}: {
  photographerId: string;
  photoId: string;
  photoSrc: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitInquiry, INITIAL_STATE);

  const [answers, setAnswers] = useState<Partial<Record<StepKey, string>>>({});
  const [revealed, setRevealed] = useState(-1); // 노출된 질문 최대 index
  const [typing, setTyping] = useState(false);
  const [contactStep, setContactStep] = useState(false);
  const [contact, setContact] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // 재선택 중인 질문 index

  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // 다음 시스템 말풍선을 타이핑 인디케이터 후 노출
  function advanceTo(index: number) {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setRevealed((r) => Math.max(r, index));
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
    advanceTo(0);
  }, []);

  // 새 말풍선마다 하단으로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [revealed, typing, contactStep, answers, done]);

  function onAnswer(i: number, value: string) {
    const key = STEPS[i].key;
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (editing === i) {
      setEditing(null); // 재선택 완료 — 다음 질문 진행 없이 그대로
      return;
    }
    if (i === revealed) {
      if (i < STEPS.length - 1) advanceTo(i + 1);
      else revealContact();
    }
  }

  function skipToContact() {
    setRevealed(STEPS.length - 1);
    revealContact();
  }

  // 제출 — 채팅 답변을 FormData 로 변환해 기존 submitInquiry 재사용
  function submit() {
    if (!contact.trim() || !agreed) return;
    const fd = new FormData();
    fd.set("photographerId", photographerId);
    fd.set("photoId", photoId);
    fd.set("purpose", answers.purpose ?? "");
    fd.set("preferredDate", answers.preferredDate ?? "");
    fd.set("region", answers.region ?? "");
    fd.set("partySize", answers.partySize ? PARTY_MAP[answers.partySize] ?? "" : "");
    fd.set("note", answers.note ?? "");
    // 연락처: 휴대폰 형태면 phone, 아니면 기타 연락처
    const digits = contact.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("01")) {
      fd.set("phone", `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`);
    } else {
      fd.set("extraContact", contact.trim());
    }
    startTransition(() => formAction(fd));
  }

  // 성공 — Lead 픽셀 발화(중복 제거 eventID) + 완료 상태
  const leadFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state.ok) return;
    if (state.inquiryId && leadFiredFor.current !== state.inquiryId) {
      leadFiredFor.current = state.inquiryId;
      window.fbq?.("track", "Lead", {}, { eventID: `inquiry_${state.inquiryId}` });
    }
    setDone(true);
  }, [state.ok, state.inquiryId]);

  return (
    <div className="fixed inset-0 z-50 mx-auto flex h-[100svh] max-w-xl flex-col bg-bg font-kr">
      {/* 상단바 */}
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => router.push(photoId ? `/photos/${photoId}` : "/")}
          aria-label="뒤로"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.06]"
        >
          <ArrowLeftIcon />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold">무료 상담 신청</p>
          <p className="text-xs text-muted">보통 1시간 내 답변드려요</p>
        </div>
      </header>

      {/* 채팅 본문 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {/* 진입 사진 + 인사 (시스템) */}
        <SystemBubble>
          {photoSrc && (
            <img
              src={photoSrc}
              alt="문의한 사진"
              className="mb-2 h-40 w-full rounded-xl object-cover"
            />
          )}
          이 사진처럼 찍어드릴 작가님과 연결해드릴게요.
          <br />몇 가지만 가볍게 골라주시면 끝나요. (다 건너뛰어도 돼요)
        </SystemBubble>

        {/* 질문/답변 */}
        {STEPS.map((step, i) => {
          if (i > revealed) return null;
          const answered = answers[step.key] !== undefined;
          const choosing = !done && (!answered || editing === i);
          return (
            <div key={step.key} className="space-y-1.5">
              <SystemBubble>{step.q}</SystemBubble>
              {choosing ? (
                <ChoiceTray
                  options={step.options}
                  soft={SOFT_SKIP}
                  selected={answers[step.key]}
                  onPick={(v) => onAnswer(i, v)}
                />
              ) : (
                <div className="ml-auto flex w-fit max-w-[88%] flex-col items-end gap-0.5">
                  <SentBubble>{answers[step.key]}</SentBubble>
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
              )}
            </div>
          );
        })}

        {typing && <TypingBubble />}

        {/* 바로 연락처 남기기 (질문 단계 동안) */}
        {!contactStep && !typing && revealed >= 0 && !done && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={skipToContact}
              className="cursor-pointer rounded-full bg-fg/[0.05] px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-fg/10 hover:text-fg"
            >
              다 건너뛰고 바로 연락처 남기기
            </button>
          </div>
        )}

        {/* 연락처 단계 */}
        {contactStep && (
          <div className="space-y-2">
            <SystemBubble>
              마지막이에요! 연락받으실 곳만 남겨주시면 작가님이 직접 연락드려요.
            </SystemBubble>
            {!done ? (
              <div className="ml-auto w-full max-w-[88%] rounded-2xl rounded-tr-md bg-brand/[0.07] p-3">
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="전화번호 · 카카오 ID · 인스타 등"
                  inputMode="text"
                  autoFocus
                  className="h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-brand"
                />
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  />
                  <span>연락처 전달 및 상담을 위한 개인정보 수집·이용에 동의합니다.</span>
                </label>
                {state.error && <p className="mt-2 text-xs font-medium text-brand">{state.error}</p>}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!contact.trim() || !agreed || pending}
                  className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-brand text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? "신청 중…" : "무료 상담 신청하기"}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* 완료 */}
        {done && (
          <SystemBubble>
            신청이 접수됐어요! 작가님이 확인 후 곧 연락드릴 거예요. 감사합니다.
          </SystemBubble>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function SystemBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="mr-auto max-w-[88%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-fg">
      {children}
    </div>
  );
}

// 내가 보낸 답변 — 채팅 전송 말풍선(오른쪽, 브랜드)
function SentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-fit rounded-2xl rounded-tr-md bg-brand px-3.5 py-2.5 text-sm font-medium text-white">
      {children}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="mr-auto flex max-w-[88%] items-center gap-1 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3">
      <Dot /> <Dot /> <Dot />
    </div>
  );
}
function Dot() {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg/40" />;
}

// 선택 트레이 — 답변 후보 버튼 + 소프트 스킵. 고르면 전송 말풍선으로 바뀜.
function ChoiceTray({
  options,
  soft,
  selected,
  onPick,
}: {
  options: string[];
  soft: string[];
  selected?: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="ml-auto flex max-w-[92%] flex-wrap justify-end gap-1.5">
      {options.map((opt) => (
        <Chip key={opt} active={selected === opt} onClick={() => onPick(opt)}>
          {opt}
        </Chip>
      ))}
      {soft.map((opt) => (
        <Chip key={opt} active={selected === opt} soft onClick={() => onPick(opt)}>
          {opt}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  children,
  active,
  soft,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  soft?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "cursor-pointer rounded-full px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-default",
        active
          ? "bg-brand text-white"
          : soft
            ? "bg-fg/[0.04] text-muted hover:bg-fg/[0.08]"
            : "border border-brand/40 bg-white text-brand hover:bg-brand/[0.06]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
