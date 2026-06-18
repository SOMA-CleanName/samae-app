"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PlusIcon } from "@/components/user/icons";
import { downscaleImage } from "@/lib/downscale";
import { submitInquiry, type InquiryState } from "./actions";

const INITIAL_STATE: InquiryState = { ok: false };

type ReferencePreview = { name: string; url: string };

export function InquiryForm({
  photographerId,
  photoId,
  photographerName,
  initialPhone,
  initialInstagramId,
}: {
  photographerId: string;
  photoId: string;
  photographerName: string;
  initialPhone: string;
  initialInstagramId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitInquiry, INITIAL_STATE);

  // 1: 상담 정보 → 2: 연락처
  const [step, setStep] = useState<1 | 2>(1);

  // 상담 정보
  const [partySize, setPartySize] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [region, setRegion] = useState("");
  const [note, setNote] = useState("");

  // 연락처
  const [phone, setPhone] = useState(formatPhone(initialPhone));
  const [instagramId, setInstagramId] = useState(initialInstagramId);
  const [kakaoId, setKakaoId] = useState("");
  const [extraContact, setExtraContact] = useState("");

  const [briefPrompt, setBriefPrompt] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referencePreviews, setReferencePreviews] = useState<ReferencePreview[]>([]);
  const [refFiles, setRefFiles] = useState<File[]>([]); // 다운스케일 대상 원본 파일
  const returnPath = photoId ? `/photos/${photoId}` : `/photographers/${photographerId}`;

  // 제출 — 레퍼런스 이미지를 업로드 전 클라이언트에서 리사이즈해 서버액션 본문 한계(1MB) 회피
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    fd.delete("referenceImages"); // 폼의 원본 파일 제거 후 리사이즈본으로 교체
    for (const file of refFiles.slice(0, 5)) {
      const small = await downscaleImage(file);
      fd.append("referenceImages", small);
    }
    formAction(fd);
  }

  useEffect(() => {
    if (!state.ok) return;
    setShowSuccess(true);
    const id = window.setTimeout(() => closeSuccess(), 7000);
    return () => window.clearTimeout(id);
  }, [state.ok]);

  function closeSuccess() {
    setShowSuccess(false);
    router.push(returnPath);
  }

  // 제출 에러 시 입력값 복원 — 보통 연락처 단계에서 발생하므로 2단계 유지
  useEffect(() => {
    if (!state.values) return;
    setPhone(formatPhone(state.values.phone));
    setInstagramId(state.values.instagramId);
    setKakaoId(state.values.kakaoId);
    setExtraContact(state.values.extraContact);
    setPartySize(state.values.brief.partySize);
    setPurpose(state.values.brief.purpose);
    setPreferredDate(state.values.brief.preferredDate);
    setRegion(state.values.brief.region);
    setNote(state.values.brief.note);
    setStep(2);
  }, [state.values]);

  const briefValid = !!partySize && !!purpose && !!preferredDate && !!region;
  const hasContact =
    !!phone.trim() || !!instagramId.trim() || !!kakaoId.trim() || !!extraContact.trim();

  function goNext() {
    if (!briefValid) {
      setBriefPrompt(true);
      return;
    }
    setBriefPrompt(false);
    setStep(2);
  }

  function openReferencePicker() {
    fileInputRef.current?.click();
  }

  function onReferenceChange(files: FileList | null) {
    referencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    const picked = Array.from(files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 5);
    setRefFiles(picked);
    setReferencePreviews(picked.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })));
  }

  useEffect(() => {
    return () => {
      referencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [referencePreviews]);

  return (
    <>
      <form action={formAction} onSubmit={handleSubmit} className="mt-3 flex min-h-[480px] flex-col md:min-h-full">
        <input type="hidden" name="photographerId" value={photographerId} />
        <input type="hidden" name="photoId" value={photoId} />
        {/* name 없음 — 원본은 자동 제출하지 않고 handleSubmit 에서 리사이즈본으로 첨부 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => onReferenceChange(event.target.files)}
        />

        <h1 className="text-3xl font-semibold leading-tight">{photographerName} 작가 촬영 문의</h1>

        {/* ── 1단계: 상담 정보 (input 들은 항상 폼에 존재, 단계에 따라 표시만 토글) ── */}
        <div className={step === 1 ? "mt-5 block" : "hidden"}>
          <p className="text-base font-semibold text-fg/85">상담 정보를 입력해주세요.</p>
          <div className="mt-5 space-y-4">
            <Field
              label="인원"
              required
              name="partySize"
              value={partySize}
              onChange={setPartySize}
              placeholder="예: 2"
              inputMode="numeric"
            />
            <Field
              label="사진 목적"
              required
              name="purpose"
              value={purpose}
              onChange={setPurpose}
              placeholder="프로필 / 커플 / 가족 / 우정 스냅 등"
            />
            <Field
              label="희망 일정"
              required
              name="preferredDate"
              value={preferredDate}
              onChange={setPreferredDate}
              placeholder="예: 6월 말 주말 오후"
            />
            <Field
              label="희망 지역"
              required
              name="region"
              value={region}
              onChange={setRegion}
              placeholder="예: 서울 성수동 일대"
            />

            <label className="block">
              <span className="text-sm font-medium text-fg/80">자유 요청</span>
              <textarea
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="원하는 분위기, 의상, 참고 사항 등"
                className="mt-2 w-full resize-none rounded-xl border border-line-strong bg-white px-4 py-3 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
              />
            </label>

            <div>
              <span className="text-sm font-medium text-fg/80">레퍼런스 사진</span>
              <div className="mt-2 grid grid-cols-5 gap-2">
                <button
                  type="button"
                  onClick={openReferencePicker}
                  aria-label="레퍼런스 사진 선택"
                  className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong bg-fg/[0.03] text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
                >
                  <PlusIcon className="h-6 w-6" />
                </button>
                {referencePreviews.map((preview) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <div key={preview.url} className="aspect-square overflow-hidden rounded-lg border border-line bg-fg/[0.04]">
                    <img src={preview.url} alt={preview.name} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              {referencePreviews.length === 0 && (
                <p className="mt-2 text-xs text-faint">원하는 분위기의 사진을 최대 5장까지 넣을 수 있어요.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── 2단계: 연락처 ── */}
        <div className={step === 2 ? "mt-5 block" : "hidden"}>
          <p className="text-base font-semibold text-fg/85">연락 가능한 수단을 하나 이상 입력해주세요.</p>
          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-fg/80">전화번호</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(formatPhone(event.target.value))}
                placeholder="010-1234-5678"
                pattern="0[0-9]{2}-[0-9]{4}-[0-9]{4}"
                className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-fg/80">인스타 DM 아이디</span>
              <input
                name="instagramId"
                type="text"
                autoComplete="off"
                value={instagramId}
                onChange={(event) => setInstagramId(event.target.value)}
                placeholder="@samae.photo"
                className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-fg/80">카카오 아이디</span>
              <input
                name="kakaoId"
                type="text"
                autoComplete="off"
                value={kakaoId}
                onChange={(event) => setKakaoId(event.target.value)}
                placeholder="카카오톡 아이디"
                className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-fg/80">기타 연락처</span>
              <input
                name="extraContact"
                type="text"
                autoComplete="off"
                value={extraContact}
                onChange={(event) => setExtraContact(event.target.value)}
                placeholder="이메일 등"
                className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
              />
            </label>
          </div>
        </div>

        {state.error && <p className="mt-4 text-sm font-medium text-brand">{state.error}</p>}

        {/* ── 하단 액션 ── */}
        <div className="mt-auto pt-6">
          {step === 1 ? (
            <>
              {briefPrompt && (
                <p className="mb-2 text-sm font-medium text-brand">필수 항목을 모두 입력해주세요.</p>
              )}
              <Button type="button" size="lg" fullWidth onClick={goNext} disabled={!briefValid}>
                다음
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="shrink-0 rounded-full border border-line-strong px-5 text-sm font-semibold text-muted transition-colors hover:bg-fg/[0.04]"
              >
                이전
              </button>
              <Button type="submit" size="lg" fullWidth loading={pending} disabled={!hasContact}>
                문의하기
              </Button>
            </div>
          )}
        </div>
      </form>

      {showSuccess && state.message && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 font-kr">
          <div className="w-full max-w-sm rounded-2xl bg-bg p-5 text-center shadow-pop">
            <p className="text-base font-semibold text-fg">{state.message}</p>
            <button
              type="button"
              onClick={closeSuccess}
              className="mt-5 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  inputMode,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg/80">
        {label}
        {required && <span className="text-xs font-medium text-brand">필수</span>}
      </span>
      <input
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
      />
    </label>
  );
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
