"use client";

// 입점 계약 동의 화면 — 승인된 작가가 스튜디오에 처음 들어올 때, 그리고 계약·정책 버전이 올라갈 때 뜬다.
//
// 작가약관 5조 2항: "이 약관과 입점 계약에 동의한 때부터 작가로 활동할 수 있다."
// 문서 4종에 각각 체크를 받고, 입점계약의 작가 정보란(성명·사업자 유형·사업자번호)과
// 홍보 사용 동의(선택, 7조)를 함께 받는다. 정산 계좌는 프로필에서 따로 등록한다.
// 동의는 photographer_agreements 에 버전·시각·IP 로 남는다 (studio/actions.ts agreePhotographerContract).

import { useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { agreePhotographerContract } from "./actions";
import { BUSINESS_TYPE_LABEL, DEFAULT_FEE_RATE, type BusinessType } from "@/lib/platform-fee";

export function AgreeGate({
  displayName,
  versions,
  initial,
  reason,
}: {
  displayName: string;
  versions: { terms: string; fee: string; refund: string; contract: string };
  initial: { legalName: string; businessType: BusinessType | ""; businessNo: string; promoConsent: boolean };
  /** "first" 처음 동의 · "updated" 버전이 올라가 다시 동의 */
  reason: "first" | "updated";
}) {
  const docs = [
    { key: "contract", label: "작가 입점 계약", href: "/terms/photographer-contract", version: versions.contract },
    { key: "terms", label: "작가 이용약관", href: "/terms/photographer", version: versions.terms },
    { key: "fee", label: "수수료·정산 정책", href: "/terms/fees", version: versions.fee },
    { key: "refund", label: "취소·환불 정책", href: "/terms/refund", version: versions.refund },
  ];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [businessType, setBusinessType] = useState<BusinessType | "">(initial.businessType);
  const [error, setError] = useState<string | null>(null);
  const allChecked = docs.every((d) => checked[d.key]);

  return (
    <main className="mx-auto max-w-lg px-4 py-10 font-kr sm:px-6">
      <h1 className="text-2xl font-semibold">
        {reason === "first" ? "입점 계약에 동의해 주세요" : "계약 내용이 바뀌어 다시 동의가 필요해요"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-fg/60">
        {displayName}님, 사매에서 작가로 활동하려면 아래 문서에 동의가 필요해요. 동의한 날이 계약일이 되고,
        동의 내용은 버전과 시각으로 보관돼요.
      </p>

      <form
        action={async (fd) => {
          setError(null);
          try {
            await agreePhotographerContract(fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해주세요.");
          }
        }}
        className="mt-6 flex flex-col gap-6"
      >
        {/* 핵심 조건 요약 — 문서를 안 열어봐도 가장 중요한 숫자는 보이게 (약관규제법 3조 설명 의무) */}
        <section className="rounded-2xl bg-fg/[0.04] p-4 text-sm leading-relaxed text-fg/75">
          <p className="font-semibold text-fg">꼭 알아야 할 것</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>중개 수수료는 촬영 대금 전체(출장비·추가금 포함)의 {DEFAULT_FEE_RATE * 100}%이고 부가세는 별도예요.</li>
            <li>정산은 결과물을 전달하고 서비스에서 전달 완료를 누른 뒤에 해요.</li>
            <li>작가 사정으로 촬영이 취소되면 고객에게 전액 환불되고 수수료 상당액이 작가에게 청구돼요.</li>
            <li>사매를 통해 만난 고객과는 서비스 밖에서 촬영 계약이나 대금을 주고받을 수 없어요.</li>
            <li>고객의 연락처는 촬영 목적으로만 쓰고, 끝나면 지체 없이 지워야 해요.</li>
          </ul>
        </section>

        {/* 문서별 동의 */}
        <fieldset className="rounded-2xl border border-fg/10 p-4">
          <legend className="px-1 text-xs text-muted">문서 동의 (필수)</legend>
          <div className="flex flex-col gap-2">
            {docs.map((d) => (
              <label
                key={d.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 has-[:checked]:border-fg"
              >
                <input
                  type="checkbox"
                  name={`agree_${d.key}`}
                  checked={!!checked[d.key]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [d.key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                />
                <span className="text-sm text-fg">
                  <Link href={d.href} target="_blank" className="underline underline-offset-2">
                    {d.label}
                  </Link>
                  을(를) 읽었고 동의합니다
                  <span className="block text-xs text-faint">버전 {d.version}</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChecked(Object.fromEntries(docs.map((d) => [d.key, true])))}
            className="mt-2 text-xs text-muted underline underline-offset-2"
          >
            모두 동의
          </button>
        </fieldset>

        {/* 작가 정보란 — 입점계약 표지 */}
        <fieldset className="rounded-2xl border border-fg/10 p-4">
          <legend className="px-1 text-xs text-muted">작가 정보 (계약 당사자)</legend>
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-sm font-medium">성명 또는 상호</span>
              <input
                id="legalName"
                name="legalName"
                required
                maxLength={60}
                defaultValue={initial.legalName}
                placeholder="실명 또는 사업자등록증의 상호"
                className="mt-1.5 w-full rounded-xl border border-fg/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-fg/40"
              />
              <span className="mt-1 block text-xs text-faint">활동명({displayName})과 별개로, 계약과 정산 서류에 쓰여요.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium">사업자 유형</span>
              <select
                id="businessType"
                name="businessType"
                required
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessType | "")}
                className="mt-1.5 w-full rounded-xl border border-fg/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-fg/40"
              >
                <option value="">선택</option>
                {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map((t) => (
                  <option key={t} value={t}>
                    {BUSINESS_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-faint">
                일반과세자는 수수료 세금계산서로 매입세액을 공제받아요. 사업자 미등록이면 정산금에서 3.3%를 원천징수해요.
              </span>
            </label>

            {businessType && businessType !== "unregistered" && (
              <label className="block">
                <span className="text-sm font-medium">사업자등록번호</span>
                <input
                  id="businessNo"
                  name="businessNo"
                  required
                  inputMode="numeric"
                  maxLength={12}
                  defaultValue={initial.businessNo}
                  placeholder="000-00-00000"
                  className="mt-1.5 w-full rounded-xl border border-fg/15 bg-surface px-3 py-2.5 text-sm outline-none focus:border-fg/40"
                />
              </label>
            )}
          </div>
        </fieldset>

        {/* 홍보 사용 동의 — 선택 (입점계약 7조) */}
        <fieldset className="rounded-2xl border border-fg/10 p-4">
          <legend className="px-1 text-xs text-muted">홍보 사용 동의 (선택)</legend>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="promoConsent"
              defaultChecked={initial.promoConsent}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="text-sm leading-relaxed text-fg/80">
              사매가 내가 게재한 사진과 활동명을 사매 웹·앱, SNS, 유료 광고, 보도자료에 홍보물별 12개월간 쓰는 것에
              동의합니다. 언제든 철회할 수 있어요.{" "}
              <Link href="/terms/ad-consent" target="_blank" className="underline underline-offset-2">
                범위와 조건
              </Link>
            </span>
          </label>
        </fieldset>

        {error && <p className="text-sm text-brand">{error}</p>}
        <Submit disabled={!allChecked} />
      </form>
    </main>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full cursor-pointer rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
    >
      {pending ? "저장 중…" : "동의하고 스튜디오 시작"}
    </button>
  );
}
