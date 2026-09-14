"use client";

// 입점 계약 동의 — 승인된 작가가 스튜디오에 처음 들어올 때, 그리고 계약·정책 버전이 올라갈 때 뜬다.
//
// 작가약관 5조 2항: "이 약관과 입점 계약에 동의한 때부터 작가로 활동할 수 있다."
//
// ⚠️ **전에는 체크박스 네 개와 [모두 동의] 버튼이었다.** 문서 링크는 새 탭으로 나갔고,
//    열었는지조차 보지 않았다. 네 문서를 **한 번도 안 열고 통과할 수 있었다.**
//    약관규제법 3조(명시·설명 의무)에서 사업자가 대는 근거는 "읽을 기회를 줬다" 인데,
//    그 기회가 실제로 주어졌다는 증거가 하나도 없었다.
//
// 지금은 세 걸음이다.
//    ① 목록   — 무엇을 읽어야 하는지, 지금 몇 개 읽었는지
//    ② 전문   — 본문을 **지면 안에 깔고**, 바닥까지 내려야 동의가 열린다 (DocReader)
//    ③ 정보   — 네 문서를 다 읽은 뒤에만 열리는 계약 당사자 정보란
//
// 문서별로 **읽은 시각과 동의한 시각을 따로** 들고 가서 제출한다. "언제 읽었고 언제
// 동의했는가" 를 문서 단위로 말할 수 없으면 기록이 있어도 다툼에서 쓸 수가 없다.

import { useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { agreePhotographerContract } from "./actions";
import { DocReader } from "./DocReader";
import { PHOTOGRAPHER_DOCS, type DocKey } from "@/components/legal/photographerDocs";
import { BUSINESS_TYPE_LABEL, DEFAULT_FEE_RATE, type BusinessType } from "@/lib/platform-fee";

/** 문서별 열람·동의 증적 */
type DocRecord = { openedAt: string; agreedAt: string };

export function AgreeGate({
  displayName,
  initial,
  reason,
  submit = agreePhotographerContract,
}: {
  displayName: string;
  // ⚠️ versions 프로퍼티를 없앴다 — 버전의 진실은 components/legal/photographerDocs 하나다.
  //    무시되는 프로퍼티를 남겨 두면 호출부가 그걸로 버전을 정한다고 착각한다.
  initial: { legalName: string; businessType: BusinessType | ""; businessNo: string; promoConsent: boolean };
  /** "first" 처음 동의 · "updated" 버전이 올라가 다시 동의 */
  reason: "first" | "updated";
  /**
   * 기본은 실제 서버 액션. 주입할 수 있게 연 건 /dev/flow(샌드박스)가 **같은 컴포넌트**를
   * 쓰면서 저장만 localStorage 로 돌리기 위해서다 — 복제하면 조용히 어긋난다.
   */
  submit?: (formData: FormData) => Promise<void>;
}) {
  const [reading, setReading] = useState<DocKey | null>(null);
  const [records, setRecords] = useState<Partial<Record<DocKey, DocRecord>>>({});
  const [openedAt, setOpenedAt] = useState<Partial<Record<DocKey, string>>>({});
  const [businessType, setBusinessType] = useState<BusinessType | "">(initial.businessType);
  const [error, setError] = useState<string | null>(null);

  const allRead = PHOTOGRAPHER_DOCS.every((d) => records[d.key]);
  const readCount = PHOTOGRAPHER_DOCS.filter((d) => records[d.key]).length;

  // ── ② 전문 열람 ──
  if (reading) {
    const idx = PHOTOGRAPHER_DOCS.findIndex((d) => d.key === reading);
    const doc = PHOTOGRAPHER_DOCS[idx];
    return (
      <DocReader
        // ⚠️ key 가 없으면 React 가 같은 인스턴스를 재사용한다 — 앞 문서에서 켜진
        //    reachedEnd 가 그대로 남아 **다음 문서가 읽지도 않았는데 열린다.**
        key={doc.key}
        label={doc.label}
        version={doc.version}
        summary={doc.summary}
        step={idx + 1}
        total={PHOTOGRAPHER_DOCS.length}
        agreed={!!records[doc.key]}
        onBack={() => setReading(null)}
        onAgree={() => {
          setRecords((prev) => ({
            ...prev,
            [doc.key]: prev[doc.key] ?? {
              openedAt: openedAt[doc.key] ?? new Date().toISOString(),
              agreedAt: new Date().toISOString(),
            },
          }));
          // 아직 안 읽은 다음 문서로 이어서 — 목록을 매번 거칠 이유가 없다
          const next = PHOTOGRAPHER_DOCS.find((d) => d.key !== doc.key && !records[d.key]);
          if (next) {
            setOpenedAt((p) => ({ ...p, [next.key]: p[next.key] ?? new Date().toISOString() }));
            setReading(next.key);
          } else {
            setReading(null);
          }
        }}
      >
        {doc.body}
      </DocReader>
    );
  }

  // ── ① 목록 + ③ 정보 ──
  return (
    <main className="mx-auto max-w-lg px-4 py-10 font-kr sm:px-6">
      <h1 className="text-2xl font-semibold">
        {reason === "first" ? "입점 계약에 동의해 주세요" : "계약 내용이 바뀌어 다시 동의가 필요해요"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-fg/60">
        {displayName}님, 사매에서 작가로 활동하려면 아래 문서를 <b className="font-semibold text-fg">전문으로 읽고</b>{" "}
        동의해 주세요. 동의한 날이 계약일이 되고, 문서별로 읽은 시각과 동의한 시각이 함께 기록돼요.
      </p>

      {/* 핵심 조건 요약 — 문서를 열기 전에 가장 중요한 숫자는 보이게 (약관규제법 3조 설명 의무) */}
      <section className="mt-6 rounded-2xl bg-fg/[0.04] p-4 text-sm leading-relaxed text-fg/75">
        <p className="font-semibold text-fg">꼭 알아야 할 것</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>중개 수수료는 촬영 대금 전체(출장비·추가금 포함)의 {DEFAULT_FEE_RATE * 100}%이고 부가세는 별도예요.</li>
          <li>정산은 결과물을 전달하고 서비스에서 전달 완료를 누른 뒤에 해요.</li>
          <li>작가 사정으로 촬영이 취소되면 고객에게 전액 환불되고 수수료 상당액이 작가에게 청구돼요.</li>
          <li>사매를 통해 만난 고객과는 서비스 밖에서 촬영 계약이나 대금을 주고받을 수 없어요.</li>
          <li>고객의 연락처는 촬영 목적으로만 쓰고, 끝나면 지체 없이 지워야 해요.</li>
        </ul>
      </section>

      {/* ① 읽어야 할 문서 — 각 항목이 전문 화면으로 들어가는 문이다 */}
      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">읽고 동의할 문서</h2>
          <p className="text-xs tabular-nums text-muted">
            {readCount} / {PHOTOGRAPHER_DOCS.length}
          </p>
        </div>

        <ul className="mt-2.5 flex flex-col gap-2">
          {PHOTOGRAPHER_DOCS.map((d, i) => {
            const rec = records[d.key];
            return (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenedAt((p) => ({ ...p, [d.key]: p[d.key] ?? new Date().toISOString() }));
                    setReading(d.key);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                    rec ? "border-fg bg-fg/[0.03]" : "border-line hover:bg-fg/[0.03]"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      rec ? "bg-fg text-bg" : "bg-fg/10 text-muted"
                    }`}
                  >
                    {rec ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{d.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{d.summary}</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      버전 {d.version}
                      {rec ? " · 동의함" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{rec ? "다시 보기" : "읽기 →"}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {!allRead && (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            문서를 열면 전문이 화면에 그대로 나와요. 끝까지 읽으면 그 자리에서 동의할 수 있어요.
          </p>
        )}
      </section>

      {/* ③ 계약 당사자 정보 — 네 문서를 다 읽은 뒤에만 */}
      {allRead ? (
        <form
          action={async (fd) => {
            setError(null);
            // 문서별 열람·동의 시각을 증적으로 함께 보낸다
            fd.set("docRecords", JSON.stringify(records));
            for (const d of PHOTOGRAPHER_DOCS) fd.set(`agree_${d.key}`, "on");
            try {
              await submit(fd);
            } catch (e) {
              setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해주세요.");
            }
          }}
          className="mt-8 flex flex-col gap-6"
        >
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
                <span className="mt-1 block text-xs text-faint">
                  활동명({displayName})과 별개로, 계약과 정산 서류에 쓰여요.
                </span>
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
                  일반과세자는 수수료 세금계산서로 매입세액을 공제받아요. 사업자 미등록이면 정산금에서 3.3%를
                  원천징수해요.
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
          <Submit />
        </form>
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-muted">
          문서 {PHOTOGRAPHER_DOCS.length}종을 모두 읽으면 계약 정보를 입력할 수 있어요.
        </p>
      )}
    </main>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full cursor-pointer rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
    >
      {pending ? "저장 중…" : "동의하고 스튜디오 시작"}
    </button>
  );
}
