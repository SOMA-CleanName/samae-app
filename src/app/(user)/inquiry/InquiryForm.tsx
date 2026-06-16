"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ClipboardIcon, PlusIcon, XIcon } from "@/components/user/icons";
import { submitInquiry, type InquiryState } from "./actions";

const INITIAL_STATE: InquiryState = { ok: false };

export function InquiryForm({
  photographerId,
  photoId,
  initialPhone,
  initialInstagramId,
  initialDiscordId,
  initialContactEmail,
}: {
  photographerId: string;
  photoId: string;
  initialPhone: string;
  initialInstagramId: string;
  initialDiscordId: string;
  initialContactEmail: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(submitInquiry, INITIAL_STATE);
  const [phone, setPhone] = useState(formatPhone(initialPhone));
  const [instagramId, setInstagramId] = useState(initialInstagramId);
  const [discordId, setDiscordId] = useState(initialDiscordId);
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [brief, setBrief] = useState<BriefValues>({
    gender: "",
    partySize: "",
    purpose: "",
    preferredDate: "",
    region: "",
    note: "",
  });
  const [briefOpen, setBriefOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [referencePreviews, setReferencePreviews] = useState<ReferencePreview[]>([]);
  const returnPath = photoId ? `/photos/${photoId}` : `/photographers/${photographerId}`;

  useEffect(() => {
    if (!state.ok) return;
    setShowSuccess(true);
    const id = window.setTimeout(() => {
      closeSuccess();
    }, 7000);
    return () => window.clearTimeout(id);
  }, [state.ok]);

  function closeSuccess() {
    setShowSuccess(false);
    router.push(returnPath);
  }

  useEffect(() => {
    if (!state.values) return;
    setPhone(formatPhone(state.values.phone));
    setInstagramId(state.values.instagramId);
    setDiscordId(state.values.discordId);
    setContactEmail(state.values.contactEmail);
    setBrief(state.values.brief);
  }, [state.values]);

  const hasBrief = !!brief.partySize && !!brief.purpose && !!brief.preferredDate;

  function openReferencePicker() {
    fileInputRef.current?.click();
  }

  function onReferenceChange(files: FileList | null) {
    referencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    const previews = Array.from(files ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 5)
      .map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    setReferencePreviews(previews);
  }

  useEffect(() => {
    return () => {
      referencePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [referencePreviews]);

  return (
    <>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="photographerId" value={photographerId} />
        <input type="hidden" name="photoId" value={photoId} />
        <input type="hidden" name="gender" value={brief.gender} />
        <input type="hidden" name="partySize" value={brief.partySize} />
        <input type="hidden" name="purpose" value={brief.purpose} />
        <input type="hidden" name="preferredDate" value={brief.preferredDate} />
        <input type="hidden" name="region" value={brief.region} />
        <input type="hidden" name="note" value={brief.note} />
        <input
          ref={fileInputRef}
          type="file"
          name="referenceImages"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => onReferenceChange(event.target.files)}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-fg/85">연락 가능한 수단을 하나 이상 입력해주세요.</p>
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            aria-label={hasBrief ? "상담 정보 수정" : "상담 정보 입력"}
            title={hasBrief ? "상담 정보 수정" : "상담 정보 입력"}
            className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-semibold text-fg/75 transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <ClipboardIcon className="h-4 w-4" />
            {hasBrief ? "상담 정보 수정" : "상담 정보 입력"}
            {!hasBrief && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-bg" />
            )}
          </button>
        </div>

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
          <span className="text-sm font-medium text-fg/80">인스타 아이디</span>
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
          <span className="text-sm font-medium text-fg/80">디스코드 아이디</span>
          <input
            name="discordId"
            type="text"
            autoComplete="off"
            value={discordId}
            onChange={(event) => setDiscordId(event.target.value)}
            placeholder="samae#1234"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-fg/80">사용하는 이메일</span>
          <input
            name="contactEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="name@example.com"
            className="mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-base outline-none transition-colors placeholder:text-fg/30 focus:border-fg/45"
          />
        </label>

        {state.error && <p className="text-sm font-medium text-brand">{state.error}</p>}

        <Button type="submit" size="lg" fullWidth loading={pending}>
          다음
        </Button>
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

      {briefOpen && (
        <BriefModal
          value={brief}
          referencePreviews={referencePreviews}
          onPickReferences={openReferencePicker}
          onChange={setBrief}
          onClose={() => setBriefOpen(false)}
        />
      )}
    </>
  );
}

type BriefValues = {
  gender: string;
  partySize: string;
  purpose: string;
  preferredDate: string;
  region: string;
  note: string;
};

type ReferencePreview = {
  name: string;
  url: string;
};

function BriefModal({
  value,
  referencePreviews,
  onPickReferences,
  onChange,
  onClose,
}: {
  value: BriefValues;
  referencePreviews: ReferencePreview[];
  onPickReferences: () => void;
  onChange: (value: BriefValues) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);

  function setField(key: keyof BriefValues, next: string) {
    setDraft((prev) => ({ ...prev, [key]: next }));
  }

  function save() {
    if (!draft.partySize || !draft.purpose || !draft.preferredDate) return;
    onChange(draft);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 font-kr"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-bg p-5 shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-title font-semibold">상담 정보 작성</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-faint">
          작가가 촬영을 준비할 수 있도록 알려주세요. 나중에 다시 작성할 수 있어요.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-muted">성별</span>
            <select
              value={draft.gender}
              onChange={(event) => setField("gender", event.target.value)}
              className="mt-1 w-full rounded-lg border border-line-strong bg-transparent px-3 py-2 text-sm"
            >
              <option value="">선택 안 함</option>
              <option value="여성">여성</option>
              <option value="남성">남성</option>
              <option value="혼성">혼성</option>
              <option value="무관">무관</option>
            </select>
          </label>

          <BriefInput
            label="인원"
            value={draft.partySize}
            onChange={(next) => setField("partySize", next)}
            placeholder="예: 2"
            inputMode="numeric"
            required
          />
          <BriefInput
            label="사진 목적"
            value={draft.purpose}
            onChange={(next) => setField("purpose", next)}
            placeholder="프로필 / 커플 / 가족 / 우정 스냅 등"
            required
          />
          <BriefInput
            label="희망 일정"
            value={draft.preferredDate}
            onChange={(next) => setField("preferredDate", next)}
            placeholder="예: 6월 말 주말 오후"
            required
          />
          <BriefInput
            label="희망 지역"
            value={draft.region}
            onChange={(next) => setField("region", next)}
            placeholder="예: 서울 성수동 일대"
          />

          <label className="block">
            <span className="text-xs text-muted">자유 요청</span>
            <textarea
              value={draft.note}
              onChange={(event) => setField("note", event.target.value)}
              rows={3}
              placeholder="원하는 분위기, 의상, 참고 사항 등"
              className="mt-1 w-full resize-none rounded-lg border border-line-strong bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <div>
            <span className="text-xs text-muted">레퍼런스 사진</span>
            <div className="mt-2 grid grid-cols-5 gap-2">
              <button
                type="button"
                onClick={onPickReferences}
                aria-label="레퍼런스 사진 선택"
                className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong bg-fg/[0.03] text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
              >
                <PlusIcon className="h-6 w-6" />
              </button>
              {referencePreviews.map((preview) => (
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

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-line-strong py-2.5 text-sm font-medium text-muted hover:bg-fg/[0.04]"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!draft.partySize || !draft.purpose || !draft.preferredDate}
            className="flex-1 rounded-full bg-fg py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function BriefInput({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        {required && <span className="font-medium text-brand">필수 입력</span>}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        required={required}
        className="mt-1 w-full rounded-lg border border-line-strong bg-transparent px-3 py-2 text-sm"
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
