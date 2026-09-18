"use client";

import { useActionState, useState } from "react";
import { updateProfile, type ProfileState } from "../actions";
import type { ProfileInitial } from "./page";
import { BUSINESS_TYPE_LABEL, type BusinessType } from "@/lib/platform-fee";
import { BusinessLicenseUpload } from "@/components/studio/BusinessLicenseUpload";

const initialState: ProfileState = {};

// 송금 받을 은행 목록 (토글 선택)
const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
  "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일은행", "씨티은행", "수협은행",
  "부산은행", "대구은행", "경남은행", "광주은행", "전북은행", "제주은행",
  "새마을금고", "신협", "우체국", "산업은행",
];

// 작가 프로필 편집 폼 — controlled 입력. 저장(서버액션)은 새로고침 없이 처리하고
// 입력한 값을 그대로 유지한다(저장 후 폼이 옛 값으로 되돌아가는 문제 방지).
export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [f, setF] = useState({
    displayName: initial.displayName,
    bio: initial.bio,
    regions: initial.regions,
    moodTags: initial.moodTags,
    priceFrom: String(initial.priceFrom),
    bankName: initial.bankName,
    accountNumber: initial.accountNumber,
    accountHolder: initial.accountHolder,
    legalName: initial.legalName,
    businessType: initial.businessType,
    businessNo: initial.businessNo,
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));

  // 계좌가 이미 입력돼 있으면 접어서 보여준다(변경 시 펼침).
  const acctInitiallySet = !!(initial.bankName && initial.accountNumber && initial.accountHolder);
  const [acctOpen, setAcctOpen] = useState(!acctInitiallySet);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field name="displayName" label="작가명" value={f.displayName} onChange={set("displayName")} error={state.fieldErrors?.displayName} />

      <div className="flex flex-col gap-1">
        <label htmlFor="bio" className="text-sm font-medium">소개</label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={500}
          value={f.bio}
          onChange={set("bio")}
          className="rounded-xl border border-fg/15 bg-surface px-4 py-3 text-sm outline-none focus:border-fg/40"
        />
      </div>

      <Field name="regions" label="활동 지역" value={f.regions} onChange={set("regions")} hint="쉼표로 구분 (예: 성수, 한강)" />
      <Field name="moodTags" label="태그" value={f.moodTags} onChange={set("moodTags")} hint="쉼표로 구분 (예: 필름, 내추럴)" />
      <Field
        name="priceFrom"
        label="최저가 (원)"
        type="number"
        value={f.priceFrom}
        onChange={set("priceFrom")}
        hint="표시용 시작 가격"
        min={0}
        max={100_000_000}
        step={1_000}
        error={state.fieldErrors?.priceFrom}
      />

      {/* 사업자 정보 — 이용계약 당사자·세무 처리 기준 (작가약관 14조·입점 동의서 1항). 입점 동의 때 받은 값을 여기서 고친다 */}
      <fieldset className="mt-2 rounded-xl border border-fg/10 p-4">
        <legend className="px-1 text-xs text-muted">사업자 정보</legend>
        <div className="flex flex-col gap-3">
          <Field name="legalName" label="성명 또는 상호" value={f.legalName} onChange={set("legalName")} hint="계약과 정산 서류에 쓰여요. 활동명과 별개" error={state.fieldErrors?.legalName} />
          <div className="flex flex-col gap-1">
            <label htmlFor="businessType" className="text-sm font-medium">사업자 유형</label>
            <select
              id="businessType"
              name="businessType"
              value={f.businessType}
              onChange={(e) => setF((prev) => ({ ...prev, businessType: e.target.value }))}
              className="rounded-xl border border-fg/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-fg/40"
            >
              <option value="">선택</option>
              {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map((t) => (
                <option key={t} value={t}>{BUSINESS_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <p className="text-xs text-faint">일반과세자는 실질 20%, 간이·미등록은 22%(부가세 포함). 사업자는 세금계산서, 미등록은 영수증을 발급해 드려요</p>
            {state.fieldErrors?.businessType && <p className="text-xs text-brand">{state.fieldErrors.businessType}</p>}

          </div>
          {f.businessType && f.businessType !== "unregistered" && (
            <Field name="businessNo" label="사업자등록번호" value={f.businessNo} onChange={set("businessNo")} hint="000-00-00000" error={state.fieldErrors?.businessNo} />
          )}
          {/* 등록증도 여기 있어야 한다. 입점 화면에만 있어서 **미등록으로 입점한 뒤
              여기서 사업자로 바꾸면 등록증 없이 통과**했다(2026-09-17 점검). 서버가 이제
              막는데 올릴 자리가 없으면 작가가 갇힌다 — 가드와 입력은 같이 있어야 한다. */}
          {f.businessType && f.businessType !== "unregistered" && (
            <BusinessLicenseUpload initialUploadedAt={initial.licenseUploadedAt} />
          )}
        </div>
      </fieldset>

      {/* 정산 계좌 — **사매가 작가에게 보내는** 계좌다.
          여기 적혀 있던 "예약이 확정되면 고객이 이 계좌로 직접 송금합니다 / 환불도 이 계좌로
          입금돼요" 는 리드·P2P 구조 시절 문구다. 지금은 고객이 사매 계좌로 보내고(에스크로),
          결과물 전달 후 수수료를 뺀 금액을 사매가 이 계좌로 보낸다. 환불은 고객에게 간다.
          계좌의 용도를 반대로 설명하고 있었다(2026-09-17 점검). */}
      <fieldset className="mt-2 rounded-xl border border-fg/10 p-4">
        <legend className="px-1 text-xs text-muted">정산 계좌</legend>
        {acctOpen ? (
          <>
            <p className="mb-2 text-xs leading-relaxed text-faint">
              촬영비는 사매가 받아 두었다가, 결과물 전달 후 중개 수수료를 뺀 금액을 이 계좌로
              보내드려요.
              <br />
              <b className="text-muted">본인(사업자) 명의</b>여야 하고, 비워 둘 수는 없어요.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="bankName" className="text-sm font-medium">은행</label>
                <div className="relative">
                  <select
                    id="bankName"
                    name="bankName"
                    value={f.bankName}
                    onChange={set("bankName")}
                    className="w-full appearance-none rounded-xl border border-fg/15 bg-surface px-4 py-3 pr-12 text-sm outline-none focus:border-fg/40"
                  >
                    <option value="">선택 안 함</option>
                    {/* 기존에 목록 밖 값이 저장돼 있으면 유지 */}
                    {f.bankName && !BANKS.includes(f.bankName) && (
                      <option value={f.bankName}>{f.bankName}</option>
                    )}
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-xs text-faint">
                    ▼
                  </span>
                </div>
                {state.fieldErrors?.bankName && (
                  <p className="text-xs text-brand-ink">{state.fieldErrors.bankName}</p>
                )}
              </div>
              <Field name="accountNumber" label="계좌번호" value={f.accountNumber} onChange={set("accountNumber")} error={state.fieldErrors?.accountNumber} />
              <Field name="accountHolder" label="예금주" value={f.accountHolder} onChange={set("accountHolder")} error={state.fieldErrors?.accountHolder} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">
                {f.bankName} {f.accountNumber}
              </p>
              <p className="mt-0.5 text-xs text-faint">예금주 {f.accountHolder} · 정산금을 받는 계좌</p>
            </div>
            <button
              type="button"
              onClick={() => setAcctOpen(true)}
              className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border border-fg/20 px-3.5 text-xs font-medium text-fg/70 transition-colors hover:bg-fg/[0.04]"
            >
              변경
            </button>
            {/* 접힌 동안에도 저장되도록 값 유지 */}
            <input type="hidden" name="bankName" value={f.bankName} />
            <input type="hidden" name="accountNumber" value={f.accountNumber} />
            <input type="hidden" name="accountHolder" value={f.accountHolder} />
          </div>
        )}
      </fieldset>

      {state.error && <p className="text-sm text-brand-ink">{state.error}</p>}
      {state.ok && <p className="text-sm text-success-ink">저장됐어요.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  value,
  onChange,
  hint,
  error,
  type = "text",
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
  error?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        className="rounded-xl border border-fg/15 bg-surface px-4 py-3 text-sm outline-none focus:border-fg/40"
      />
      {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      {error && <p className="text-xs text-brand-ink">{error}</p>}
    </div>
  );
}
