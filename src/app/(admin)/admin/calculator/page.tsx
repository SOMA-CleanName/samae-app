"use client";

import { useMemo, useState } from "react";

import {
  DEFAULT_VAT,
  PAYOUT_FEE,
  paymentSplit,
  type SplitKey,
  monthlyVat,
  unitEconomics,
  type VatSettings,
} from "@/lib/calculator-vat";

// 사매 건당 손익 계산기 — 광고비(CPA)·성사율·수수료로 성사 1건당 손익을 본다.
//   성사당 CPA = 문의당 CPA ÷ 성사율 · 건당 손익 = 순수수료 − 성사당 CPA
// 계산은 전부 src/lib/calculator-vat.ts (테스트 있음) 에 있고, 여기는 화면만 그린다.
//
// 부가세(VAT): 손익은 **공급가액(VAT 제외)** 으로 본다. 수수료 15,000원을 받아도
// 1,364원은 국세청 몫이고, 광고비·PG 에 낸 부가세는 매입세액으로 돌려받는다.
// 토글을 끄면 예전(세전) 계산과 정확히 같은 값이 나온다.

const fmt = new Intl.NumberFormat("ko-KR");
const won = (n: number) => `${fmt.format(Math.round(n))}원`;
const signWon = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${fmt.format(Math.abs(r))}원`;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const TAKES = [4, 6, 8, 10, 12, 15, 20]; // 매트릭스 세로축 — 우리가 떼는 요율(%)
const RATES = [20, 30, 40, 50, 60, 70, 80];
/** 분배 막대·점 색 — 사매만 브랜드색, 나머지는 회색조, 세금은 경고색 */
const SPLIT_COLOR: Record<SplitKey, string> = {
  photographer: "bg-fg/25",
  samae: "bg-brand",
  pg: "bg-fg/45",
  payoutAgent: "bg-fg/60",
  tax: "bg-danger/60",
};

const MAXMAG = 30000; // 매트릭스 셀 색 농도 기준 최대 손익 폭

/** PG 수수료 기본값 — 카드 결제를 붙이면 결제 **전액**에 붙는다(우리 몫이 아니라) */
const PG_PCT = 3.3;

type Preset = {
  label: string;
  shoot: number;
  take: number;
  pg: boolean;
  rate: number;
  cpa: number;
  /** 부가세 설정까지 바꾸는 시나리오 (기본값 위에 덮어쓴다) */
  vat?: Partial<VatSettings>;
};
const PRESETS: Preset[] = [
  // 지금은 건당 정액 6,000원 — 촬영비 15만 기준이면 4% 에 해당한다
  {
    label: "현재 (정액 6천)",
    shoot: 150000,
    take: 4,
    pg: false,
    rate: 33,
    cpa: 11529,
  },
  {
    label: "정률 10%",
    shoot: 150000,
    take: 10,
    pg: false,
    rate: 33,
    cpa: 11529,
  },
  {
    label: "정률 10% + PG",
    shoot: 150000,
    take: 10,
    pg: true,
    rate: 33,
    cpa: 11529,
  },
  {
    label: "요율 15%",
    shoot: 150000,
    take: 15,
    pg: false,
    rate: 33,
    cpa: 11529,
  },
  {
    label: "촬영비 30만",
    shoot: 300000,
    take: 10,
    pg: false,
    rate: 33,
    cpa: 11529,
  },
  {
    label: "성사율 50%",
    shoot: 150000,
    take: 10,
    pg: false,
    rate: 50,
    cpa: 11529,
  },
  // 세금 시나리오 — 부가세를 아예 안 보는 경우와, 총액 인식이 최악으로 도는 경우
  {
    label: "세전 (VAT 무시)",
    shoot: 150000,
    take: 10,
    pg: false,
    rate: 33,
    cpa: 11529,
    vat: { on: false },
  },
  {
    label: "판매자로 잡힘 · 증빙 0%",
    shoot: 150000,
    take: 10,
    pg: false,
    rate: 33,
    cpa: 11529,
    vat: { model: "reseller", proofPct: 0 },
  },
];

// 숫자 입력 + 슬라이더 페어
function Ctrl({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  scale,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  scale: [string, string, string];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm font-medium text-fg">{label}</span>
        <span className="flex items-baseline gap-1 rounded-lg border border-line-strong bg-surface-2 px-2 py-1">
          <input
            type="number"
            value={value}
            min={0}
            step={step}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(v);
            }}
            className="w-20 bg-transparent text-right text-body-sm font-semibold tabular-nums text-fg outline-none"
          />
          <span className="text-caption text-faint">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(e) => onChange(+e.target.value)}
        className="mt-2 w-full cursor-pointer accent-fg"
        aria-label={`${label} 슬라이더`}
      />
      <div className="flex justify-between text-label tabular-nums text-faint">
        <span>{scale[0]}</span>
        <span>{scale[1]}</span>
        <span>{scale[2]}</span>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const [shoot, setShoot] = useState(150000); // 건당 평균 촬영비 (원)
  const [takePct, setTakePct] = useState(10); // 우리가 떼는 수수료율 (%)
  const [pgOn, setPgOn] = useState(false); // PG 결제를 붙였을 때
  const [pgPct, setPgPct] = useState(PG_PCT); // PG 수수료율 (%)
  const [ratePct, setRatePct] = useState(33); // 문의 후 성사율 (%)
  const [cpa, setCpa] = useState(11529); // 문의당 CPA (원)
  const [payoutFee, setPayoutFee] = useState(PAYOUT_FEE); // 지급대행 수수료 (건당 정액, 공급가액)
  const [vol, setVol] = useState(40); // 월 문의완료 건수

  // 콘텐츠 마케팅 — 하루에 끌어오는 건수로 한 달 수익을 본다
  const [perDay, setPerDay] = useState(2); // 하루 평균 유입 건수
  const [byInquiry, setByInquiry] = useState(false); // 위 값이 '문의' 기준일 때 성사율을 곱한다
  const [days, setDays] = useState(30); // 한 달 영업일
  const [contentCost, setContentCost] = useState(500000); // 콘텐츠 제작·운영 월 고정비

  // 부가세 설정
  const [vat, setVat] = useState<VatSettings>(DEFAULT_VAT);
  const patchVat = (patch: Partial<VatSettings>) => setVat((v) => ({ ...v, ...patch }));

  const d = useMemo(() => {
    const u = unitEconomics({
      shoot,
      takePct,
      pgOn,
      pgPct,
      ratePct,
      cpa,
      payoutFee,
      vat,
    });
    return {
      ...u,
      rate: clamp(ratePct, 1, 100) / 100,
      monthly: vol * (clamp(ratePct, 1, 100) / 100) * u.pl,
    };
  }, [shoot, takePct, pgOn, pgPct, ratePct, cpa, payoutFee, vol, vat]);
  const fee = d.netFee; // 건당 순수수료 (공급가액)

  // 콘텐츠 마케팅 수익 — 건당 순수수료(위 입력)를 그대로 쓰고 물량만 바꿔 끼운다.
  // 유료 광고와 달리 건당 CPA 가 아니라 **월 고정비**(제작·운영)로 잡는 게 맞다.
  // 고정비도 부가세 포함 청구액이라, 공제되는 비중만큼은 비용에서 빠진다.
  const c = useMemo(() => {
    const shootsPerDay = byInquiry ? perDay * d.rate : perDay; // 실제 성사되는 촬영 건수/일
    const shoots = shootsPerDay * days;
    const gmv = shoots * shoot;
    const gross = shoots * d.billedFee; // 청구 기준 총수수료
    const net = shoots * d.netFee; // 월 순매출 = 순수수료(공급가액) 합
    const structure = shoots * d.structureCost; // 판매자로 잡혔을 때 새는 돈
    const { contentSupply, contentInputVat } = monthlyVat({
      unit: d,
      vat,
      shoots: 0,
      inquiries: 0,
      contentCost,
    });
    const profit = net - structure - contentSupply;
    // 손익분기 — 고정비를 덮으려면 하루에 몇 건이 필요한가 (입력과 같은 기준으로 환산)
    const per = d.netFee - d.structureCost; // 촬영 1건이 실제로 남기는 돈
    const bepShoots = per > 0 ? contentSupply / per / days : Infinity;
    const bepPerDay = byInquiry ? (d.rate > 0 ? bepShoots / d.rate : Infinity) : bepShoots;
    return {
      shootsPerDay,
      shoots,
      gmv,
      gross,
      net,
      structure,
      contentSupply,
      contentInputVat,
      profit,
      bepPerDay,
    };
  }, [perDay, byInquiry, days, contentCost, shoot, vat, d]);
  // 고객이 낸 돈이 어디로 가는가 — 합은 항상 촬영비와 같다
  const split = useMemo(() => paymentSplit(shoot, d), [shoot, d]);

  const cProfitColor = c.profit >= 0 ? "text-success" : "text-danger";

  // 합산 대시보드 — 유료(광고) 채널 + 콘텐츠 채널의 한 달 순이익
  //   유료: 문의 vol 건 × 성사율 = 촬영 건수, 비용은 문의 전체에 붙는 CPA
  //   콘텐츠: 위 섹션 그대로 (비용은 월 고정비)
  // 부가세는 손익에 넣지 않는다 — 대신 걷어서 내는 돈이라 따로 표시한다.
  // 단 공제받지 못하는 부가세(작가 세금계산서 미수취분)는 진짜 비용이라 손익에 넣는다.
  const t = useMemo(() => {
    const paidShoots = vol * d.rate;
    const paidNet = paidShoots * d.netFee;
    const paidStructure = paidShoots * d.structureCost;
    const paidCost = vol * d.adSupply + paidStructure; // 광고비는 문의 전부에 든다 (공급가액)
    const paid = {
      shoots: paidShoots,
      net: paidNet,
      cost: paidCost,
      profit: paidNet - paidCost,
    };
    const content = {
      shoots: c.shoots,
      net: c.net,
      cost: c.contentSupply + c.structure,
      profit: c.profit,
    };

    const shoots = paid.shoots + content.shoots;
    const net = paid.net + content.net;
    const cost = paid.cost + content.cost;
    const profit = net - cost;
    const tax = monthlyVat({
      unit: d,
      vat,
      shoots,
      inquiries: vol,
      contentCost,
    });
    return {
      paid,
      content,
      shoots,
      net,
      cost,
      profit,
      tax,
      gmv: shoots * shoot,
      margin: net > 0 ? (profit / net) * 100 : 0,
      blendedCac: shoots > 0 ? cost / shoots : 0, // 촬영 1건 따오는 데 실제로 든 돈
      perShoot: shoots > 0 ? profit / shoots : 0,
    };
  }, [vol, shoot, contentCost, vat, d, c]);
  const tProfitColor = t.profit >= 0 ? "text-success" : "text-danger";

  const stateColor = d.positive ? "text-success" : "text-danger";
  const nearTake = TAKES.reduce((a, b) => (Math.abs(b - takePct) < Math.abs(a - takePct) ? b : a));
  const nearRate = RATES.reduce((a, b) => (Math.abs(b - ratePct) < Math.abs(a - ratePct) ? b : a));

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 font-kr sm:px-5">
      <h1 className="text-xl font-semibold text-fg">사매 건당 손익 계산기</h1>
      <p className="mt-2 w-fit rounded-lg border border-line bg-surface px-3 py-2 text-caption tabular-nums text-muted">
        순수수료 = <b className="text-fg">촬영비 × 요율 − PG − 지급대행</b> · 성사당 CPA ={" "}
        <b className="text-fg">문의당 CPA ÷ 성사율</b> · 건당 손익 ={" "}
        <b className="text-fg">순수수료 − 성사당 CPA</b>
        {vat.on && (
          <>
            {" "}
            · 모든 금액은 <b className="text-fg">부가세 {vat.pct}% 를 뺀 공급가액</b>
            {vat.model === "reseller" && (
              <>
                {" "}
                · <b className="text-danger">판매자 인정</b> 시나리오
              </>
            )}
          </>
        )}
      </p>

      <div className="mt-4">
        <p className="mb-2 text-label font-semibold uppercase tracking-wider text-faint">
          시나리오
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setShoot(p.shoot);
                setTakePct(p.take);
                setPgOn(p.pg);
                setRatePct(p.rate);
                setCpa(p.cpa);
                setVat({ ...DEFAULT_VAT, ...p.vat });
              }}
              className="cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5 text-caption text-muted transition-colors hover:border-fg/30 hover:text-fg"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1단계. 촬영 1건에서 우리에게 실제로 남는 돈 ── */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">
            1단계 — 순수수료
          </p>
          <p className="text-caption text-muted">
            촬영 1건이 성사됐을 때, 광고비를 빼기 전에 우리 손에 남는 돈
          </p>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Ctrl
              label="건당 평균 촬영비"
              value={shoot}
              onChange={(v) => setShoot(clamp(v, 0, 2000000))}
              min={0}
              max={500000}
              step={10000}
              suffix="원"
              scale={["0", "25만", "50만"]}
            />
            <Ctrl
              label="우리 수수료율"
              value={takePct}
              onChange={(v) => setTakePct(clamp(v, 0, 100))}
              min={0}
              max={30}
              step={0.5}
              suffix="%"
              scale={["0%", "15%", "30%"]}
            />

            {/* PG — 붙였다 뗐다 하면서 마진이 얼마나 깎이는지 본다 */}
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={pgOn}
                  onChange={(e) => setPgOn(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className="flex-1 text-body-sm font-medium text-fg">PG 결제 붙이기</span>
                <span className="flex items-baseline gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1">
                  <input
                    type="number"
                    value={pgPct}
                    step={0.1}
                    min={0}
                    disabled={!pgOn}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setPgPct(clamp(v, 0, 100));
                    }}
                    className="w-12 bg-transparent text-right text-body-sm font-semibold tabular-nums text-fg outline-none disabled:opacity-40"
                  />
                  <span className="text-caption text-faint">%</span>
                </span>
              </label>
              <p className="mt-2 text-label leading-relaxed text-muted">
                PG 수수료는 우리 몫이 아니라 <b className="text-fg">결제 전액</b>에 붙어요. 작가에게
                줄 돈은 그대로 나가므로 {pgOn ? "지금" : ""} 그만큼이 통째로 마진에서 빠집니다.
                {vat.on && vat.pgDeductible && (
                  <> 다만 매입세액은 공제되니 실제 부담은 {(pgPct / 1.1).toFixed(2)}% 예요.</>
                )}
              </p>
            </div>
            {/* 지급대행 — 정률이 아니라 건당 정액이라 촬영비가 쌀수록 아프다 */}
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-sm font-medium text-fg">지급대행 수수료</span>
                <span className="flex items-baseline gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1">
                  <input
                    type="number"
                    value={payoutFee}
                    step={50}
                    min={0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setPayoutFee(clamp(v, 0, 100000));
                    }}
                    className="w-16 bg-transparent text-right text-body-sm font-semibold tabular-nums text-fg outline-none"
                  />
                  <span className="text-caption text-faint">원/건</span>
                </span>
              </div>
              <p className="mt-2 text-label leading-relaxed text-muted">
                작가에게 정산금을 보낼 때마다 건당 정액으로 나가요 — {won(payoutFee)}
                {vat.on ? (
                  <>
                    {" "}
                    + 부가세 {won(d.payoutFeeInputVat)} ={" "}
                    <b className="text-fg">{won(d.payoutFeeBilled)}</b> 청구, 세액은 공제되니
                    실부담은 <b className="text-fg">{won(d.payoutFeeSupply)}</b>.
                  </>
                ) : (
                  <> (VAT 포함 {won(payoutFee * 1.1)}).</>
                )}{" "}
                정률이 아니라서 촬영비가 쌀수록 아파요 — 지금 순수수료의{" "}
                <b className="tabular-nums text-fg">
                  {d.feeSupply > 0 ? ((d.payoutFeeSupply / d.feeSupply) * 100).toFixed(1) : "—"}%
                </b>
                .
              </p>
            </div>

            {/* 부가세 — 손익은 공급가액으로, 납부세액은 따로 */}
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={vat.on}
                  onChange={(e) => patchVat({ on: e.target.checked })}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className="flex-1 text-body-sm font-medium text-fg">부가세(VAT) 반영</span>
                <span className="flex items-baseline gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1">
                  <input
                    type="number"
                    value={vat.pct}
                    step={1}
                    min={0}
                    disabled={!vat.on}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) patchVat({ pct: clamp(v, 0, 100) });
                    }}
                    className="w-12 bg-transparent text-right text-body-sm font-semibold tabular-nums text-fg outline-none disabled:opacity-40"
                  />
                  <span className="text-caption text-faint">%</span>
                </span>
              </label>

              {vat.on ? (
                <div className="mt-3 space-y-2.5 border-t border-line pt-3">
                  <VatToggle
                    checked={vat.feeIncludesVat}
                    onChange={(b) => patchVat({ feeIncludesVat: b })}
                    label="수수료는 VAT 포함 금액"
                    hint={`받는 ${won(d.billedFee)} 안에 ${won(d.billedFee - d.billedFee / (1 + d.v))}가 세금이에요. 끄면 별도로 더 받는다는 뜻.`}
                  />
                  <VatToggle
                    checked={vat.adDeductible}
                    onChange={(b) => patchVat({ adDeductible: b })}
                    label="광고비 매입세액 공제"
                    hint="세금계산서를 받는 매체면 켜요. 광고비의 1/11 이 돌아옵니다."
                  />
                  <VatToggle
                    checked={vat.pgDeductible}
                    onChange={(b) => patchVat({ pgDeductible: b })}
                    label="PG 수수료 매입세액 공제"
                    hint={
                      pgOn
                        ? `국내 PG 는 세금계산서를 주니 보통 켭니다. 건당 ${won(d.pgInputVat)} 가 돌아와요.`
                        : "국내 PG 는 세금계산서를 주니 보통 켭니다. 지금은 PG 가 꺼져 있어요."
                    }
                  />
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body-sm text-fg">콘텐츠 고정비 중 공제 가능</span>
                      <span className="flex items-baseline gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1">
                        <input
                          type="number"
                          value={vat.contentDeductiblePct}
                          step={5}
                          min={0}
                          max={100}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v))
                              patchVat({
                                contentDeductiblePct: clamp(v, 0, 100),
                              });
                          }}
                          className="w-12 bg-transparent text-right text-body-sm font-semibold tabular-nums text-fg outline-none"
                        />
                        <span className="text-caption text-faint">%</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={vat.contentDeductiblePct}
                      onChange={(e) => patchVat({ contentDeductiblePct: +e.target.value })}
                      className="mt-2 w-full cursor-pointer accent-fg"
                      aria-label="콘텐츠 고정비 중 공제 가능 비중"
                    />
                    <p className="text-label leading-relaxed text-muted">
                      급여·인건비는 매입세액 공제 대상이 아니에요. 외주·툴·광고 제작처럼
                      세금계산서를 받는 비중만 넣으세요.
                    </p>
                  </div>

                  {/* 세무상 구조 — 이 계산기에서 가장 큰 갈림길 */}
                  <div className="rounded-lg border border-line bg-surface p-2.5">
                    <p className="text-body-sm font-medium text-fg">세무상 우리가 판 것</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {(
                        [
                          ["brokerage", "중개", "수수료만 매출"],
                          ["reseller", "판매자로 인정", "촬영비 전액 매출"],
                        ] as const
                      ).map(([key, name, sub]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => patchVat({ model: key })}
                          aria-pressed={vat.model === key}
                          className={`cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            vat.model === key
                              ? "border-fg/40 bg-fg/[0.06]"
                              : "border-line bg-surface-2 hover:border-fg/25"
                          }`}
                        >
                          <span
                            className={`block text-body-sm font-semibold ${
                              vat.model === key ? "text-fg" : "text-muted"
                            }`}
                          >
                            {name}
                          </span>
                          <span className="mt-0.5 block text-label text-faint">{sub}</span>
                        </button>
                      ))}
                    </div>

                    {vat.model === "brokerage" ? (
                      <p className="mt-2.5 text-label leading-relaxed text-muted">
                        작가가 고객에게 촬영을 팔고, 우리는 작가에게 수수료를 판 구조예요.
                        세금계산서는 <b className="text-fg">사매 → 작가</b> 한 방향뿐이라{" "}
                        <b className="text-fg">작가에게서 받을 증빙은 없습니다.</b> 이걸 지키는 건
                        통신판매중개업 신고 · 약관의 중개자 조항 · PG 분리정산(작가 몫이 작가 매출로
                        기록) · 정산 내역서의 촬영비/수수료 분리, 이 넷이에요.
                      </p>
                    ) : (
                      <>
                        <p className="mt-2.5 text-label leading-relaxed text-danger">
                          PG 가맹이 사매 단독 명의라 카드매출 전액이 사매 사업자로 잡히면 이렇게
                          봐요 — 우리가 {won(shoot)}짜리 촬영을 팔고 작가에게서 {won(d.payout)}에 사
                          온 것. 그 {won(d.payout)}을 비용으로 인정받으려면 적격증빙이 필요해집니다.
                        </p>

                        <div className="mt-3 space-y-3 border-t border-line pt-3">
                          <VatSlider
                            label="적격증빙 수취율"
                            value={vat.proofPct}
                            onChange={(n) => patchVat({ proofPct: n })}
                            hint="세금계산서·계산서·원천징수영수증 중 아무거나 받은 비율. 못 받은 만큼은 비용 인정이 안 돼요."
                          />
                          <VatSlider
                            label="ㄴ 그중 세금계산서 (과세 작가)"
                            value={vat.taxableSharePct}
                            onChange={(n) => patchVat({ taxableSharePct: n })}
                            hint="매입세액 공제는 여기까지만 돼요. 면세 프리랜서는 증빙을 줘도 부가세가 따라오지 않습니다."
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <VatNum
                              label="소득세·법인세 실효세율"
                              value={vat.incomeTaxPct}
                              onChange={(n) => patchVat({ incomeTaxPct: n })}
                            />
                            <VatNum
                              label="증빙 미수취 가산세"
                              value={vat.penaltyPct}
                              onChange={(n) => patchVat({ penaltyPct: n })}
                            />
                          </div>

                          <dl className="space-y-1 rounded-lg border border-danger/30 bg-danger-soft/40 px-2.5 py-2 text-label tabular-nums">
                            <div className="flex justify-between gap-2">
                              <dt className="text-muted">떠안는 부가세</dt>
                              <dd className="font-medium text-fg">{won(d.unrecoveredVat)}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-muted">비용 불인정 → 추가 소득세</dt>
                              <dd className="font-medium text-fg">{won(d.disallowedTax)}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                              <dt className="text-muted">미수취 가산세</dt>
                              <dd className="font-medium text-fg">{won(d.penalty)}</dd>
                            </div>
                            <div className="flex justify-between gap-2 border-t border-danger/25 pt-1">
                              <dt className="font-semibold text-fg">건당 구조 비용</dt>
                              <dd className="font-bold text-danger">{won(d.structureCost)}</dd>
                            </div>
                          </dl>

                          <p className="text-label leading-relaxed text-muted">
                            수취율은 올려서 해결하는 값이 아니에요 — 작가 풀이 면세 프리랜서 위주면
                            구조적으로 낮을 수밖에 없습니다.{" "}
                            <b className="text-fg">수취율이 필요 없는 구조(중개)를 확정하는 것</b>이
                            답이고, 이 화면은 그게 무너졌을 때 얼마가 새는지 보는 용도예요.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-label leading-relaxed text-muted">
                  끄면 세금을 없는 셈 치고 봅니다 — 예전 계산과 같은 값이에요.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-caption text-muted">건당 순수수료</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums text-fg sm:text-4xl">
                  {won(d.netFee)}
                </span>
                <span className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-caption font-semibold tabular-nums text-muted">
                  촬영비의 {shoot > 0 ? ((d.netFee / shoot) * 100).toFixed(1) : "—"}%
                </span>
                <span className="w-full text-caption text-muted">
                  명목 요율은 {takePct}% 인데 실질은{" "}
                  <b className="tabular-nums text-fg">
                    {shoot > 0 ? ((d.netFee / shoot) * 100).toFixed(1) : "—"}%
                  </b>{" "}
                  예요.
                  {vat.on && <> 금액은 부가세를 뺀 공급가액입니다.</>}
                </span>
              </div>
            </div>

            {/* 고객이 낸 100% 가 누구에게 가는가 */}
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-body-sm font-semibold text-fg">
                  고객이 낸 {won(shoot)} 은 어디로 가나
                </p>
                <p className="text-label text-faint">합계는 항상 100%</p>
              </div>

              {/* 누적 막대 */}
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-fg/[0.08]">
                {split.map((r) => (
                  <div
                    key={r.key}
                    className={SPLIT_COLOR[r.key]}
                    style={{ width: `${clamp(r.pct, 0, 100).toFixed(2)}%` }}
                    title={`${r.label} ${r.pct.toFixed(1)}%`}
                  />
                ))}
              </div>

              <dl className="mt-3 space-y-1.5">
                {split.map((r) => (
                  <div key={r.key} className="flex items-baseline gap-2.5">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SPLIT_COLOR[r.key]}`}
                      aria-hidden
                    />
                    <dt
                      className={`flex-1 text-caption ${
                        r.key === "samae" ? "font-semibold text-fg" : "text-muted"
                      }`}
                    >
                      {r.label}
                    </dt>
                    <dd
                      className={`w-16 text-right text-body-sm font-bold tabular-nums ${
                        r.amount < 0 ? "text-danger" : r.key === "samae" ? "text-brand" : "text-fg"
                      }`}
                    >
                      {r.pct.toFixed(1)}%
                    </dd>
                    <dd className="w-24 text-right text-caption tabular-nums text-muted">
                      {signWon(r.amount)}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-3 text-label leading-relaxed text-faint">
                PG·지급대행은 부가세를 뺀 공급가액만 그들의 몫이에요 — 청구액에 붙은 부가세는
                그들이 내고 우리가 공제받으니 결국 국세청으로 갑니다.
                {split[0].amount > 0 && (
                  <>
                    {" "}
                    작가 몫 <b className="tabular-nums text-fg">{won(split[0].amount)}</b> 안에서
                    작가가 낼 세금은 작가 사정이라 여기서 나누지 않았어요.
                  </>
                )}
                {vat.model === "reseller" && (
                  <>
                    {" "}
                    <b className="text-danger">판매자로 잡히면</b> 새는 소득세·가산세까지 국세청
                    몫으로 잡힙니다.
                  </>
                )}
              </p>
            </div>

            {/* 어디서 얼마가 빠지는지 한 줄씩 */}
            <dl className="overflow-hidden rounded-xl border border-line bg-surface-2">
              {(
                [
                  ["총수수료 (촬영비 × 요율)", won(d.billedFee), false],
                  ...(vat.on && vat.feeIncludesVat
                    ? ([[`부가세 ${vat.pct}%`, `−${won(d.billedFee - d.feeSupply)}`, false]] as [
                        string,
                        string,
                        boolean,
                      ][])
                    : []),
                  ...(pgOn
                    ? ([
                        [
                          `PG ${pgPct}%${vat.on && vat.pgDeductible ? " (공제 후)" : ""}`,
                          `−${won(d.pgSupply)}`,
                          false,
                        ],
                      ] as [string, string, boolean][])
                    : []),
                  ...(payoutFee > 0
                    ? ([
                        [
                          `지급대행${vat.on ? " (공제 후)" : ""}`,
                          `−${won(d.payoutFeeSupply)}`,
                          false,
                        ],
                      ] as [string, string, boolean][])
                    : []),
                  ["순수수료", won(d.netFee), true],
                  ...(d.structureCost > 0.5
                    ? ([
                        ["구조 비용 (판매자 인정)", `−${won(d.structureCost)}`, false],
                        ["구조 비용까지 뺀 실수령", won(d.netFee - d.structureCost), true],
                      ] as [string, string, boolean][])
                    : []),
                ] as [string, string, boolean][]
              ).map(([k, v, strong]) => (
                <div
                  key={k}
                  className={`flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0 ${
                    strong ? "bg-fg/[0.04]" : ""
                  }`}
                >
                  <dt className={`text-caption ${strong ? "font-semibold text-fg" : "text-muted"}`}>
                    {k}
                  </dt>
                  <dd
                    className={`tabular-nums ${
                      strong ? "text-body font-bold text-fg" : "text-body-sm font-medium text-fg"
                    }`}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="text-caption leading-relaxed text-faint">
              여기까지는 광고비와 무관해요 — 촬영이 성사되기만 하면 나오는 돈입니다. 이 값이 작으면
              아래에서 무슨 짓을 해도 안 남아요.
            </p>
          </div>
        </div>
      </section>

      {/* ── 2단계. 광고비를 붙였을 때의 건당·월 손익 ── */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">
            2단계 — 건당 손익 · 월 손익
          </p>
          <p className="text-caption text-muted">
            위 순수수료 <b className="tabular-nums text-fg">{won(d.netFee)}</b> 에서 광고비를 뺀다
          </p>
        </div>
        <p className="mt-2 w-fit rounded-lg border border-line bg-surface-2 px-3 py-2 text-caption tabular-nums text-muted">
          성사당 CPA = <b className="text-fg">문의당 CPA ÷ 성사율</b> · 건당 손익 ={" "}
          <b className="text-fg">순수수료 − 성사당 CPA</b>
          {d.structureCost > 0.5 && <> − 구조 비용</>}
        </p>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Ctrl
              label="문의 후 성사율"
              value={ratePct}
              onChange={(v) => setRatePct(clamp(v, 1, 100))}
              min={1}
              max={100}
              step={1}
              suffix="%"
              scale={["1%", "50%", "100%"]}
            />
            <Ctrl
              label="문의당 CPA"
              value={cpa}
              onChange={(v) => setCpa(clamp(v, 0, 100000))}
              min={500}
              max={30000}
              step={100}
              suffix="원"
              scale={["500", "1.5만", "3만"]}
            />
            <Ctrl
              label="월 문의완료"
              value={vol}
              onChange={(v) => setVol(clamp(v, 0, 2000))}
              min={5}
              max={200}
              step={5}
              suffix="건"
              scale={["5", "100", "200"]}
            />
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className={`text-3xl font-bold tabular-nums sm:text-4xl ${stateColor}`}>
                {signWon(d.pl)}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${
                  Math.abs(d.pl) < 500
                    ? "bg-fg/[0.06] text-muted"
                    : d.positive
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger"
                }`}
              >
                {Math.abs(d.pl) < 500 ? "손익분기" : d.positive ? "흑자" : "적자"}
              </span>
              <span className="w-full text-caption text-muted">
                성사 1건마다 {d.positive ? "남는" : "까먹는"} 금액이에요. 순수수료 {won(fee)} −
                획득비용 {won(d.acq)}
                {d.structureCost > 0.5 && <> − 구조 비용 {won(d.structureCost)}</>}.
              </span>
            </div>

            <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-2 sm:grid-cols-4">
              {(
                [
                  ["순수수료 (1단계)", won(d.netFee)],
                  ["성사당 CPA", won(d.acq)],
                  ["회수율 (매출÷비용)", `${isFinite(d.roas) ? d.roas.toFixed(2) : "∞"}×`],
                  ["월 성사", `${(vol * d.rate).toFixed(1)}건`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="border-b border-line px-3.5 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <dt className="text-caption text-muted">{k}</dt>
                  <dd className="text-body font-semibold tabular-nums text-fg">{v}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 text-label font-semibold uppercase tracking-wider text-faint">
                손익분기까지 — 나머지 둘을 고정했을 때
              </p>
              <div className="space-y-2">
                <TargetRow
                  name="필요 성사율"
                  value={`${d.needRate.toFixed(1)}%`}
                  gap={
                    d.needRate > 100
                      ? { text: "수학적으로 불가능", tone: "bad" }
                      : d.needRate - ratePct <= 0
                        ? { text: "이미 충족", tone: "ok" }
                        : {
                            text: `+${(d.needRate - ratePct).toFixed(1)}%p 필요`,
                            tone: "bad",
                          }
                  }
                />
                <TargetRow
                  name="필요 수수료율"
                  value={isFinite(d.needTake) ? `${d.needTake.toFixed(1)}%` : "—"}
                  gap={
                    d.needTake <= takePct
                      ? { text: "이미 충족", tone: "ok" }
                      : {
                          text: `+${(d.needTake - takePct).toFixed(1)}%p 필요`,
                          tone: "bad",
                        }
                  }
                />
                <TargetRow
                  name="필요 순수수료"
                  value={won(d.acq)}
                  gap={
                    d.acq / Math.max(fee, 1) <= 1
                      ? { text: "이미 충족", tone: "ok" }
                      : {
                          text: `${(d.acq / Math.max(fee, 1)).toFixed(2)}× 인상`,
                          tone: "bad",
                        }
                  }
                />
                <TargetRow
                  name="필요 문의당 CPA"
                  value={won(d.needCpa)}
                  gap={
                    d.needCpa >= cpa
                      ? { text: "이미 충족", tone: "ok" }
                      : {
                          text: `${(((d.needCpa - cpa) / Math.max(cpa, 1)) * 100).toFixed(0)}%`,
                          tone: "bad",
                        }
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-line-strong px-4 py-3">
              <p className="text-caption text-muted">
                월 손익 — 문의 {vol}건 × 성사율 {ratePct}%
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className={`text-2xl font-bold tabular-nums sm:text-3xl ${stateColor}`}>
                  {signWon(d.monthly)}
                </span>
                <span className="text-caption text-muted">
                  연 환산 <b className={`tabular-nums ${stateColor}`}>{signWon(d.monthly * 12)}</b>{" "}
                  · 광고비 총액 <b className="tabular-nums text-fg">{won(vol * d.adSupply)}</b>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 민감도 매트릭스 */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">
            민감도 — 수수료율 × 성사율
          </p>
          <p className="text-caption text-muted">
            촬영비 <b className="tabular-nums text-fg">{won(shoot)}</b> · 문의당 CPA{" "}
            <b className="tabular-nums text-fg">{won(cpa)}</b>
            {pgOn && <> · PG {pgPct}% 포함</>}
            {payoutFee > 0 && <> · 지급대행 {won(payoutFee)}/건</>}
            {vat.on && (
              <>
                {" "}
                · 부가세 {vat.pct}%{vat.model === "reseller" && " · 판매자 인정"} 반영
              </>
            )}{" "}
            기준 · 셀은 건당 손익
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-caption tabular-nums">
            <thead>
              <tr>
                <th className="border border-line bg-surface-2 px-2.5 py-2 text-left font-medium text-muted">
                  수수료율 \ 성사율
                </th>
                {RATES.map((r) => (
                  <th
                    key={r}
                    className="border border-line bg-surface-2 px-2.5 py-2 text-right font-medium text-muted"
                  >
                    {r}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TAKES.map((t) => (
                <tr key={t}>
                  <th className="border border-line bg-surface-2 px-2.5 py-2 text-left font-semibold text-muted">
                    {t}%
                    <span className="ml-1 font-normal text-faint">
                      {won(
                        unitEconomics({
                          shoot,
                          takePct: t,
                          pgOn,
                          pgPct,
                          ratePct,
                          cpa,
                          payoutFee,
                          vat,
                        }).netFee,
                      )}
                    </span>
                  </th>
                  {RATES.map((rp) => {
                    // 셀마다 요율·성사율이 다르므로 건당 손익을 통째로 다시 구한다
                    // (PG·부가세 설정은 위 입력을 그대로 따라간다)
                    const pl = unitEconomics({
                      shoot,
                      takePct: t,
                      pgOn,
                      pgPct,
                      ratePct: rp,
                      cpa,
                      payoutFee,
                      vat,
                    }).pl;
                    const mag = Math.min(1, Math.abs(pl) / MAXMAG);
                    const alpha = (mag * 0.9 + 0.06) * 0.35;
                    const here = t === nearTake && rp === nearRate;
                    return (
                      <td
                        key={rp}
                        className={`border border-line px-2.5 py-2 text-right text-fg ${
                          here ? "outline outline-2 -outline-offset-2 outline-fg font-semibold" : ""
                        }`}
                        style={{
                          background:
                            pl >= 0
                              ? `rgba(16,122,87,${alpha.toFixed(3)})`
                              : `rgba(190,54,44,${alpha.toFixed(3)})`,
                        }}
                      >
                        {signWon(pl)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-caption leading-relaxed text-faint">
          성사당 CPA는 문의당 CPA ÷ 성사율이므로, 성사율이 낮을수록 같은 광고비가 몇 배로 불어나요.
          회수율 1.0× 미만은 성사 1건마다 그만큼 손실이 난다는 뜻.
          <br />
          PG 를 붙이면 요율에서{" "}
          {vat.on && vat.pgDeductible ? (pgPct / 1.1).toFixed(2) : pgPct.toFixed(2)}
          %p 를 그냥 뺀 것과 같아요 — 결제 전액에 붙는데 작가 정산액은 줄지 않으니까요.
          {vat.on && vat.pgDeductible && " (매입세액 공제 후 기준)"} 지금 계좌이체(에스크로)로 받는
          건 이 비용이 없다는 뜻이기도 해요.
          <br />
          출장비는 수수료 대상이 아니라 촬영비만 넣으면 되고, 부가 매출(무빙컷 등)이 있으면 촬영비에
          더해서, 유기 유입 비중이 있으면 문의당 CPA에 유료 비중을 곱한 blended 값으로 넣으면 돼요.
          {vat.on && (
            <>
              <br />
              부가세를 켜면 셀 값이 전부 공급가액 기준으로 내려앉아요. 수수료가 VAT 포함이면 요율{" "}
              {takePct}% 는 실질 {(takePct / 1.1).toFixed(1)}% 와 같습니다 — 손익분기 요율이 그만큼
              위로 올라가요.
            </>
          )}
        </p>
      </section>

      {/* 콘텐츠 마케팅 — 하루 유입 건수 → 한 달 수익 */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">
            콘텐츠 마케팅 — 하루 유입 건수로 보는 한 달 수익
          </p>
          <p className="text-caption text-muted">
            위 입력의 촬영비 <b className="tabular-nums text-fg">{won(shoot)}</b> · 요율{" "}
            <b className="tabular-nums text-fg">{takePct}%</b>
            {pgOn && <> · PG {pgPct}%</>}
            {vat.on && <> · 부가세 {vat.pct}%</>} → 건당 순수수료{" "}
            <b className="tabular-nums text-fg">{won(fee)}</b>
          </p>
        </div>
        <p className="mt-2 w-fit rounded-lg border border-line bg-surface-2 px-3 py-2 text-caption tabular-nums text-muted">
          월 순매출 = <b className="text-fg">하루 촬영 건수 × 영업일 × 순수수료</b> · 월 순이익 ={" "}
          <b className="text-fg">월 순매출 − 콘텐츠 고정비</b>
          {vat.on && <> · 모두 부가세를 뺀 공급가액</>}
        </p>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* 입력 */}
          <div className="space-y-5 rounded-xl border border-line bg-surface-2 p-4">
            <Ctrl
              label={byInquiry ? "하루 평균 문의 건수" : "하루 평균 촬영 건수"}
              value={perDay}
              onChange={(v) => setPerDay(clamp(v, 0, 100))}
              min={0}
              max={20}
              step={0.5}
              suffix="건/일"
              scale={["0", "10", "20"]}
            />
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={byInquiry}
                onChange={(e) => setByInquiry(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="text-label leading-relaxed text-muted">
                이 값은 <b className="text-fg">문의</b> 기준 — 켜면 성사율 {ratePct}%를 곱해서 실제
                촬영 건수로 환산해요. 끄면 입력값을 그대로 성사된 촬영 건수로 봅니다.
              </span>
            </label>
            <Ctrl
              label="한 달 영업일"
              value={days}
              onChange={(v) => setDays(clamp(v, 1, 31))}
              min={1}
              max={31}
              step={1}
              suffix="일"
              scale={["1", "16", "31"]}
            />
            <Ctrl
              label="콘텐츠 월 고정비"
              value={contentCost}
              onChange={(v) => setContentCost(clamp(v, 0, 50000000))}
              min={0}
              max={5000000}
              step={100000}
              suffix="원"
              scale={["0", "250만", "500만"]}
            />
            <p className="text-label leading-relaxed text-faint">
              콘텐츠는 건당 광고비가 아니라 제작·운영에 매달 나가는 고정비로 잡아요
              (인건비·외주·툴). 유료 광고를 같이 돌리면 위쪽 CPA 계산기와 따로 보고 합치면 됩니다.
              {vat.on && (
                <>
                  {" "}
                  부가세는 공제 가능 비중 {vat.contentDeductiblePct}% 만큼만 빠져서, 실제 비용은{" "}
                  <b className="tabular-nums text-fg">{won(c.contentSupply)}</b> 로 잡혀요.
                </>
              )}
            </p>
          </div>

          {/* 결과 */}
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-caption text-muted">월 순이익</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className={`text-3xl font-bold tabular-nums sm:text-4xl ${cProfitColor}`}>
                  {signWon(c.profit)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${
                    c.profit >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  }`}
                >
                  {c.profit >= 0 ? "흑자" : "적자"}
                </span>
                <span className="w-full text-caption text-muted">
                  월 촬영 <b className="tabular-nums text-fg">{c.shoots.toFixed(1)}건</b> (하루{" "}
                  {c.shootsPerDay.toFixed(2)}건) · 연 환산{" "}
                  <b className={`tabular-nums ${cProfitColor}`}>{signWon(c.profit * 12)}</b>
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-2 sm:grid-cols-3">
              {(
                [
                  ["월 거래액 (GMV)", won(c.gmv)],
                  ["월 총수수료", won(c.gross)],
                  ...(vat.on && vat.feeIncludesVat
                    ? ([
                        [
                          `월 매출부가세 ${vat.pct}%`,
                          `−${won(c.shoots * (d.billedFee - d.feeSupply))}`,
                        ],
                      ] as const)
                    : []),
                  [
                    pgOn ? `월 PG ${pgPct}%` : "월 PG (꺼짐)",
                    pgOn ? `−${won(c.shoots * d.pgSupply)}` : "—",
                  ],
                  ...(payoutFee > 0
                    ? ([["월 지급대행", `−${won(c.shoots * d.payoutFeeSupply)}`]] as const)
                    : []),
                  ["월 순매출", won(c.net)],
                  ...(c.structure > 0.5 ? ([["구조 비용", `−${won(c.structure)}`]] as const) : []),
                  [
                    vat.on && c.contentInputVat > 0.5 ? "콘텐츠 고정비 (공제 후)" : "콘텐츠 고정비",
                    `−${won(c.contentSupply)}`,
                  ],
                  [
                    "손익분기",
                    isFinite(c.bepPerDay) ? `하루 ${c.bepPerDay.toFixed(2)}건` : "불가능",
                  ],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="border-b border-line px-3.5 py-2.5 sm:border-r sm:last:border-r-0"
                >
                  <dt className="text-caption text-muted">{k}</dt>
                  <dd className="text-body font-semibold tabular-nums text-fg">{v}</dd>
                </div>
              ))}
            </dl>

            {/* 하루 건수별 월 수익 */}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] border-collapse text-caption tabular-nums">
                <thead>
                  <tr>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-left font-medium text-muted">
                      하루 {byInquiry ? "문의" : "촬영"}
                    </th>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-right font-medium text-muted">
                      월 촬영
                    </th>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-right font-medium text-muted">
                      월 순매출
                    </th>
                    <th className="border-b border-line bg-surface-2 px-3 py-2 text-right font-medium text-muted">
                      월 순이익
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[0.5, 1, 2, 3, 5, 10, 20].map((n) => {
                    const shoots = (byInquiry ? n * d.rate : n) * days;
                    const net = shoots * fee;
                    const profit = net - shoots * d.structureCost - c.contentSupply;
                    const here = Math.abs(n - perDay) < 0.26;
                    return (
                      <tr key={n} className={here ? "bg-fg/[0.05] font-semibold" : ""}>
                        <td className="border-b border-line px-3 py-2 text-fg last:border-b-0">
                          {n}건
                        </td>
                        <td className="border-b border-line px-3 py-2 text-right text-muted">
                          {shoots.toFixed(1)}건
                        </td>
                        <td className="border-b border-line px-3 py-2 text-right text-fg">
                          {won(net)}
                        </td>
                        <td
                          className={`border-b border-line px-3 py-2 text-right ${
                            profit >= 0 ? "text-success" : "text-danger"
                          }`}
                        >
                          {signWon(profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <p className="mt-3 text-caption leading-relaxed text-faint">
          콘텐츠는 한 번 만들면 계속 도는 대신 물량이 천천히 붙어요. 고정비는 그대로 나가니까 하루{" "}
          {isFinite(c.bepPerDay) ? c.bepPerDay.toFixed(2) : "—"}건을 넘기기 전까지는 적자, 넘긴
          다음부터는 건당 순수수료 {won(fee)}가 거의 그대로 이익으로 쌓입니다.
        </p>
      </section>

      {/* 합산 대시보드 — 유료 + 콘텐츠 */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">
            월 순이익 대시보드 — 유료 + 콘텐츠 합산
          </p>
          <p className="text-caption text-muted">
            위 두 계산기의 물량을 그대로 더한 값이에요 · 건당 순수수료{" "}
            <b className="tabular-nums text-fg">{won(fee)}</b>
          </p>
        </div>

        {/* 합계 */}
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4">
          <p className="text-caption text-muted">두 채널 합계 월 순이익</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className={`text-3xl font-bold tabular-nums sm:text-4xl ${tProfitColor}`}>
              {signWon(t.profit)}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${
                t.profit >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              {t.profit >= 0 ? "흑자" : "적자"}
            </span>
            <span className="w-full text-caption text-muted">
              월 촬영 <b className="tabular-nums text-fg">{t.shoots.toFixed(1)}건</b> · 순매출{" "}
              <b className="tabular-nums text-fg">{won(t.net)}</b> − 총비용{" "}
              <b className="tabular-nums text-fg">{won(t.cost)}</b> · 연 환산{" "}
              <b className={`tabular-nums ${tProfitColor}`}>{signWon(t.profit * 12)}</b>
            </span>
          </div>
        </div>

        {/* 채널별 */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                key: "paid",
                name: "유료 광고",
                sub: `월 문의 ${vol}건 · 성사율 ${ratePct}% · 문의당 CPA ${won(cpa)}${
                  vat.on && vat.adDeductible ? ` (공제 후 ${won(d.adSupply)})` : ""
                }`,
                costLabel: "광고비",
                ch: t.paid,
              },
              {
                key: "content",
                name: "콘텐츠 마케팅",
                sub: `하루 ${perDay}건${byInquiry ? " (문의 기준)" : ""} · ${days}일 · 고정비`,
                costLabel: "콘텐츠 고정비",
                ch: t.content,
              },
            ] as const
          ).map(({ key, name, sub, costLabel, ch }) => {
            const share = t.shoots > 0 ? (ch.shoots / t.shoots) * 100 : 0;
            const good = ch.profit >= 0;
            return (
              <div key={key} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-sm font-semibold text-fg">{name}</span>
                  <span
                    className={`text-body font-bold tabular-nums ${good ? "text-success" : "text-danger"}`}
                  >
                    {signWon(ch.profit)}
                  </span>
                </div>
                <p className="mt-0.5 text-label text-faint">{sub}</p>

                {/* 촬영 건수 비중 */}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fg/[0.08]">
                  <div
                    className={good ? "h-full bg-success" : "h-full bg-danger"}
                    style={{ width: `${clamp(share, 0, 100).toFixed(1)}%` }}
                  />
                </div>
                <p className="mt-1 text-label tabular-nums text-faint">
                  촬영 {ch.shoots.toFixed(1)}건 · 전체의 {share.toFixed(0)}%
                </p>

                <dl className="mt-3 space-y-1.5 text-caption tabular-nums">
                  <div className="flex justify-between">
                    <dt className="text-muted">순매출</dt>
                    <dd className="font-medium text-fg">{won(ch.net)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">{costLabel}</dt>
                    <dd className="font-medium text-fg">−{won(ch.cost)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">촬영 1건당 획득비용</dt>
                    <dd className="font-medium text-fg">
                      {ch.shoots > 0 ? won(ch.cost / ch.shoots) : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        {/* 합산 지표 */}
        <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-2 sm:grid-cols-5">
          {(
            [
              ["월 거래액 (GMV)", won(t.gmv)],
              ["월 순매출", won(t.net)],
              ["월 총비용", `−${won(t.cost)}`],
              ["블렌디드 획득비용", t.shoots > 0 ? won(t.blendedCac) : "—"],
              ["촬영 1건당 순이익", t.shoots > 0 ? signWon(t.perShoot) : "—"],
            ] as const
          ).map(([k, v]) => (
            <div
              key={k}
              className="border-b border-line px-3.5 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <dt className="text-caption text-muted">{k}</dt>
              <dd className="text-body font-semibold tabular-nums text-fg">{v}</dd>
            </div>
          ))}
        </dl>

        {/* 부가세 — 손익이 아니라 대신 걷어서 내는 돈 */}
        {vat.on && (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-label font-semibold uppercase tracking-wider text-faint">
                월 부가세 — 손익과 별개로 통장에서 빠져나갈 돈
              </p>
              <p className="text-caption text-muted">
                납부세액 = <b className="text-fg">매출세액 − 매입세액</b> · 분기마다 신고
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums text-fg sm:text-3xl">
                {t.tax.payable >= 0 ? won(t.tax.payable) : `환급 ${won(-t.tax.payable)}`}
              </span>
              <span className="text-caption text-muted">
                분기 환산 <b className="tabular-nums text-fg">{won(t.tax.payable * 3)}</b> · 연{" "}
                <b className="tabular-nums text-fg">{won(t.tax.payable * 12)}</b>
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-3 lg:grid-cols-5">
              {(
                [
                  ["매출세액", won(t.tax.outputVat)],
                  ["매입세액", `−${won(t.tax.inputVat)}`],
                  ["ㄴ 광고비분", won(t.tax.adInputVat)],
                  ["ㄴ PG 수수료분", pgOn ? won(t.tax.pgInputVat) : "—"],
                  ["ㄴ 지급대행분", payoutFee > 0 ? won(t.tax.payoutFeeInputVat) : "—"],
                  ["ㄴ 콘텐츠 고정비분", won(t.tax.contentInputVat)],
                  ...(t.tax.payoutInputVat > 0.5
                    ? ([["ㄴ 작가 정산분", won(t.tax.payoutInputVat)]] as const)
                    : []),
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="border-b border-line px-3.5 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <dt className="text-caption text-muted">{k}</dt>
                  <dd className="text-body-sm font-semibold tabular-nums text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 text-caption leading-relaxed text-faint">
              이 돈은 손익에 들어가지 않아요 — 고객에게서 대신 걷어 국세청에 내는 돈이라, 위 순이익{" "}
              <b className="tabular-nums text-fg">{signWon(t.profit)}</b> 에서 또 빼면 안 됩니다.
              다만 <b className="text-fg">현금은 실제로 나가니까</b> 분기 납부일에 맞춰 남겨둬야
              해요.
              {t.shoots * d.structureCost > 0.5 && (
                <>
                  {" "}
                  반대로 판매자로 잡혀서 새는{" "}
                  <b className="tabular-nums text-danger">{won(t.shoots * d.structureCost)}</b> 는
                  돌려받을 수 없는 진짜 비용이라, 이미 위 손익에 반영돼 있어요.
                </>
              )}
            </p>
          </div>
        )}

        <p className="mt-3 text-caption leading-relaxed text-faint">
          유료는 물량을 돈으로 살 수 있는 대신 건당 비용이 그대로 따라붙고, 콘텐츠는 고정비를 넘긴
          다음부터 건당 순수수료가 거의 통째로 남아요. 그래서 합산 순이익률은 콘텐츠 비중이 커질수록
          올라갑니다 — 지금은 순매출 대비 {t.margin.toFixed(0)}%.
          {t.paid.profit < 0 && t.profit >= 0 && (
            <> 지금은 콘텐츠가 유료 적자를 메우는 구조라, 유료를 줄이면 합계가 더 좋아져요.</>
          )}
        </p>
      </section>
    </main>
  );
}

// 손익분기 목표 행
function TargetRow({
  name,
  value,
  gap,
}: {
  name: string;
  value: string;
  gap: { text: string; tone: "ok" | "bad" };
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
      <span className="text-caption text-muted">{name}</span>
      <span className="text-body-sm font-semibold tabular-nums text-fg">{value}</span>
      <span
        className={`rounded-md px-2 py-0.5 text-label font-medium tabular-nums ${
          gap.tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
        }`}
      >
        {gap.text}
      </span>
    </div>
  );
}

// 부가세 세부 토글 한 줄
function VatToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm text-fg">{label}</span>
        <span className="mt-0.5 block text-label leading-relaxed text-muted">{hint}</span>
      </span>
    </label>
  );
}

// 부가세 세부 슬라이더 (0~100%)
function VatSlider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body-sm text-fg">{label}</span>
        <span className="flex items-baseline gap-1 rounded-lg border border-line-strong bg-surface-2 px-2 py-1">
          <input
            type="number"
            value={value}
            step={5}
            min={0}
            max={100}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!isNaN(n)) onChange(clamp(n, 0, 100));
            }}
            className="w-12 bg-transparent text-right text-body-sm font-semibold tabular-nums text-fg outline-none"
          />
          <span className="text-caption text-faint">%</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="mt-1.5 w-full cursor-pointer accent-fg"
        aria-label={label}
      />
      <p className="text-label leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

// 세율 같은 짧은 숫자 입력
function VatNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <span className="block text-label text-muted">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1">
        <input
          type="number"
          value={value}
          step={0.5}
          min={0}
          max={100}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(clamp(n, 0, 100));
          }}
          className="w-12 bg-transparent text-body-sm font-semibold tabular-nums text-fg outline-none"
        />
        <span className="text-caption text-faint">%</span>
      </span>
    </label>
  );
}
