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
import { useFormStatus } from "react-dom";
import { Button, Card } from "@/components/ui";
import { agreePhotographerContract } from "./actions";
import { DocReader } from "./DocReader";
import { PHOTOGRAPHER_DOCS, type DocKey } from "@/components/legal/photographerDocs";
import { InlineDocSheet } from "@/components/legal/InlineDocSheet";
import { BusinessLicenseUpload } from "@/components/studio/BusinessLicenseUpload";
import { AdConsentBody } from "@/components/legal/docs/AdConsentBody";
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
  initial: {
    legalName: string;
    businessType: BusinessType | "";
    businessNo: string;
    promoConsent: boolean;
    /** 이미 올려 둔 사업자등록증이 있으면 그 시각 */
    licenseUploadedAt?: string | null;
  };
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
  // 입력하는 대로 하이픈을 붙인다. 서버도 어차피 000-00-00000 으로 정규화하지만(actions.ts),
  // 치는 동안 형태가 보여야 자릿수를 틀렸는지 사람이 안다 — 열 자리를 다 치고 나서
  // "10자리를 입력해주세요" 를 보는 것보다 낫다.
  const [businessNo, setBusinessNo] = useState(initial.businessNo ?? "");
  const [error, setError] = useState<string | null>(null);

  /** 문서를 연다 — 연 시각을 그때 한 번만 찍는다(다시 열어도 처음 연 시각을 지킨다) */
  const openDoc = (key: DocKey) => {
    setOpenedAt((p) => ({ ...p, [key]: p[key] ?? new Date().toISOString() }));
    setReading(key);
  };

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
    <main className="mx-auto max-w-lg px-5 py-12 font-kr">
      <p className="text-label uppercase tracking-wide text-brand">작가 입점</p>
      <h1 className="mt-2.5 text-h1 font-bold tracking-tight">
        {reason === "first" ? "입점 계약에 동의해 주세요" : "계약 내용이 바뀌어 다시 동의가 필요해요"}
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted">
        {displayName}님, 사매에서 작가로 활동하려면 아래 문서를{" "}
        <b className="font-semibold text-fg">전문으로 읽고</b> 동의해 주세요. 동의한 날이 계약일이 되고,
        문서별로 읽은 시각과 동의한 시각이 함께 기록돼요.
      </p>

      {/* 핵심 조건 요약 — 문서를 열기 전에 가장 중요한 숫자는 보이게 (약관규제법 3조 설명 의무) */}
      <section className="mt-8 rounded-2xl bg-surface-2 p-5">
        <p className="text-body font-semibold">꼭 알아야 할 것</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {[
            `중개 수수료는 촬영 대금 전체(출장비·추가금 포함)의 ${DEFAULT_FEE_RATE * 100}%이고 부가세는 별도예요.`,
            "정산은 결과물을 전달하고 서비스에서 전달 완료를 누른 뒤에 해요.",
            "작가 사정으로 촬영이 취소되면 고객에게 전액 환불되고 수수료 상당액이 작가에게 청구돼요.",
            "사매를 통해 만난 고객과는 서비스 밖에서 촬영 계약이나 대금을 주고받을 수 없어요.",
            "고객의 연락처는 촬영 목적으로만 쓰고, 끝나면 지체 없이 지워야 해요.",
          ].map((line) => (
            <li key={line} className="flex gap-2.5 text-body-sm leading-relaxed text-muted">
              <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line-strong" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ① 읽어야 할 문서 — 각 항목이 전문 화면으로 들어가는 문이다 */}
      <section className="mt-9">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-h2 font-semibold">읽고 동의할 문서</h2>
          <p className="shrink-0 text-caption tabular-nums text-muted">
            <b className="font-semibold text-fg">{readCount}</b> / {PHOTOGRAPHER_DOCS.length}
          </p>
        </div>

        {/* 진행 막대 — 몇 개 남았는지 숫자보다 먼저 눈에 들어오게 */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div
            className="h-full rounded-full bg-fg transition-[width] duration-300"
            style={{ width: `${(readCount / PHOTOGRAPHER_DOCS.length) * 100}%` }}
          />
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {PHOTOGRAPHER_DOCS.map((d, i) => {
            const rec = records[d.key];
            return (
              <li key={d.key}>
                <Card
                  interactive
                  role="button"
                  tabIndex={0}
                  onClick={() => openDoc(d.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDoc(d.key);
                    }
                  }}
                  className={`flex items-center gap-3.5 p-4 ${rec ? "border-fg" : ""}`}
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-caption font-semibold ${
                      rec ? "bg-fg text-bg" : "bg-line text-muted"
                    }`}
                  >
                    {rec ? <CheckMark /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold">{d.label}</span>
                    <span className="mt-0.5 block text-body-sm leading-relaxed text-muted">{d.summary}</span>
                    <span className="mt-1 block text-caption text-faint">
                      버전 {d.version}
                      {rec ? " · 동의함" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-caption font-medium text-muted">
                    {rec ? "다시 보기" : "읽기 →"}
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>

        {!allRead && (
          <p className="mt-3.5 text-caption leading-relaxed text-muted">
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
          className="mt-10 flex flex-col gap-6"
        >
          <fieldset className="rounded-2xl border border-line p-5">
            <legend className="px-1.5 text-caption font-medium text-muted">작가 정보 (계약 당사자)</legend>
            <div className="mt-1 flex flex-col gap-4">
              <label className="block">
                <span className="text-body-sm font-semibold">성명 또는 상호</span>
                <input
                  id="legalName"
                  name="legalName"
                  required
                  maxLength={60}
                  defaultValue={initial.legalName}
                  placeholder="실명 또는 사업자등록증의 상호"
                  className={FIELD}
                />
                <span className="mt-1.5 block text-caption leading-relaxed text-muted">
                  활동명({displayName})과 별개로, 계약과 정산 서류에 쓰여요.
                </span>
              </label>

              <label className="block">
                <span className="text-body-sm font-semibold">사업자 유형</span>
                <select
                  id="businessType"
                  name="businessType"
                  required
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as BusinessType | "")}
                  className={FIELD}
                >
                  <option value="">선택</option>
                  {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map((t) => (
                    <option key={t} value={t}>
                      {BUSINESS_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-caption leading-relaxed text-muted">
                  수수료 증빙을 어떤 형태로 발급할지 정하는 값이에요. 사업자 등록 작가에게는
                  세금계산서를(일반과세자는 이걸로 매입세액을 공제받아요), 미등록 작가에게는
                  지출증빙용 현금영수증을 발급해요. 사매는 원천징수를 하지 않으니 정산금은 직접 신고하시면 돼요.
                </span>
              </label>

              {businessType && businessType !== "unregistered" && (
                <label className="block">
                  <span className="text-body-sm font-semibold">사업자등록번호</span>
                  <input
                    id="businessNo"
                    name="businessNo"
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    value={businessNo}
                    onChange={(e) => setBusinessNo(formatBusinessNo(e.target.value))}
                    placeholder="000-00-00000"
                    className={FIELD}
                  />
                </label>
              )}

              {/* 번호만으로는 세금계산서를 못 만든다 — 등록증의 상호·대표자와 대조해야 한다.
                  그 대조가 곧 전자상거래법 20조의 "확인" 이다(0124 주석). */}
              {businessType && businessType !== "unregistered" && (
                <BusinessLicenseUpload initialUploadedAt={initial.licenseUploadedAt} />
              )}

            </div>
          </fieldset>

          {/* 홍보 사용 동의 — 선택 (입점계약 7조) */}
          <fieldset className="rounded-2xl border border-line p-5">
            <legend className="px-1.5 text-caption font-medium text-muted">홍보 사용 동의 (선택)</legend>
            <label className="mt-1 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="promoConsent"
                defaultChecked={initial.promoConsent}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-brand"
              />
              <span className="text-body-sm leading-relaxed text-muted">
                사매가 내가 게재한 사진과 활동명을 사매 웹·앱, SNS, 유료 광고, 보도자료에 홍보물별 12개월간 쓰는
                것에 동의합니다. 언제든 철회할 수 있어요.{" "}
                {/* 새 탭으로 내보내지 않는다 — 읽으러 갔다가 안 돌아온다(InlineDocSheet 주석) */}
                <InlineDocSheet label="범위와 조건" title="사매 광고 소재 사용 동의">
                  <AdConsentBody />
                </InlineDocSheet>
              </span>
            </label>
          </fieldset>

          {error && <p className="text-body-sm text-danger-ink">{error}</p>}
          <Submit />
        </form>
      ) : (
        <p className="mt-10 rounded-2xl border border-dashed border-line-strong px-5 py-6 text-center text-body-sm text-muted">
          문서 {PHOTOGRAPHER_DOCS.length}종을 모두 읽으면 계약 정보를 입력할 수 있어요.
        </p>
      )}
    </main>
  );
}

/** 입력 칸 — 프리미티브 Input 은 leftIcon/invalid 전용 래퍼라 여기선 같은 규격만 맞춘다 */
const FIELD =
  "mt-2 h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-body outline-none " +
  "transition-colors focus:border-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" size="lg" fullWidth loading={pending}>
      동의하고 스튜디오 시작
    </Button>
  );
}

/**
 * 사업자등록번호 표시 형식 — `000-00-00000`.
 *
 * 숫자만 남기고 10자리로 자른 뒤 3-2-5 로 끊는다. 자릿수가 모자라면 있는 만큼만 끊어서
 * 치는 도중에도 형태가 유지된다. 지우는 중에 하이픈이 되살아나 커서가 갇히는 일이 없도록
 * 경계(3·5자리)에서는 하이픈을 붙이지 않는다.
 */
function formatBusinessNo(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
