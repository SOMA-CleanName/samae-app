"use client";

import { useMemo, useState } from "react";

// 사매 건당 손익 계산기 — 광고비(CPA)·성사율·수수료로 성사 1건당 손익을 본다.
//   성사당 CPA = 문의당 CPA ÷ 성사율 · 건당 손익 = 평균 수수료 − 성사당 CPA
// (외부 HTML 프로토타입을 어드민 페이지로 포팅 — 로직 동일, 스타일은 앱 토큰 사용)

const fmt = new Intl.NumberFormat("ko-KR");
const won = (n: number) => `${fmt.format(Math.round(n))}원`;
const signWon = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${fmt.format(Math.abs(r))}원`;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const TAKES = [4, 6, 8, 10, 12, 15, 20]; // 매트릭스 세로축 — 우리가 떼는 요율(%)
const RATES = [20, 30, 40, 50, 60, 70, 80];
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
};
const PRESETS: Preset[] = [
  // 지금은 건당 정액 6,000원 — 촬영비 15만 기준이면 4% 에 해당한다
  { label: "현재 (정액 6천)", shoot: 150000, take: 4, pg: false, rate: 33, cpa: 11529 },
  { label: "정률 10%", shoot: 150000, take: 10, pg: false, rate: 33, cpa: 11529 },
  { label: "정률 10% + PG", shoot: 150000, take: 10, pg: true, rate: 33, cpa: 11529 },
  { label: "요율 15%", shoot: 150000, take: 15, pg: false, rate: 33, cpa: 11529 },
  { label: "촬영비 30만", shoot: 300000, take: 10, pg: false, rate: 33, cpa: 11529 },
  { label: "성사율 50%", shoot: 150000, take: 10, pg: false, rate: 50, cpa: 11529 },
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
  const [vol, setVol] = useState(40); // 월 문의완료 건수

  // 콘텐츠 마케팅 — 하루에 끌어오는 건수로 한 달 수익을 본다
  const [perDay, setPerDay] = useState(2); // 하루 평균 유입 건수
  const [byInquiry, setByInquiry] = useState(false); // 위 값이 '문의' 기준일 때 성사율을 곱한다
  const [days, setDays] = useState(30); // 한 달 영업일
  const [contentCost, setContentCost] = useState(500000); // 콘텐츠 제작·운영 월 고정비

  const d = useMemo(() => {
    const rate = clamp(ratePct, 1, 100) / 100;

    // 수수료는 더 이상 직접 넣는 값이 아니다 — 촬영비 × 요율에서 나온다.
    // PG 를 붙이면 그 비용은 **우리 몫이 아니라 결제 전액**에 붙는다.
    // 작가에게 줄 돈은 그대로 나가므로, PG 수수료는 통째로 우리 마진에서 빠진다.
    const gross = shoot * (clamp(takePct, 0, 100) / 100); // 총수수료
    const pgCost = pgOn ? shoot * (clamp(pgPct, 0, 100) / 100) : 0;
    const fee = gross - pgCost; // 순수수료 = 실제로 우리에게 남는 매출

    const acq = cpa / rate; // 성사당 CPA
    const pl = fee - acq; // 건당 손익
    const needRate = fee > 0 ? (cpa / fee) * 100 : Infinity; // 손익분기 성사율
    const needCpa = fee * rate; // 손익분기 CPA
    // 손익분기 요율 — 성사당 CPA 를 덮으려면 촬영비의 몇 %를 떼야 하는가 (PG 몫 포함)
    const needTake =
      shoot > 0 ? (acq / shoot) * 100 + (pgOn ? clamp(pgPct, 0, 100) : 0) : Infinity;
    return {
      rate,
      gross,
      pgCost,
      fee,
      acq,
      pl,
      positive: pl >= 0,
      roas: acq > 0 ? fee / acq : Infinity,
      needRate,
      needCpa,
      needTake,
      monthly: vol * rate * pl,
    };
  }, [shoot, takePct, pgOn, pgPct, ratePct, cpa, vol]);
  const fee = d.fee;

  // 콘텐츠 마케팅 수익 — 건당 순수수료(위 입력)를 그대로 쓰고 물량만 바꿔 끼운다.
  // 유료 광고와 달리 건당 CPA 가 아니라 **월 고정비**(제작·운영)로 잡는 게 맞다.
  const c = useMemo(() => {
    const shootsPerDay = byInquiry ? perDay * d.rate : perDay; // 실제 성사되는 촬영 건수/일
    const shoots = shootsPerDay * days;
    const gmv = shoots * shoot;
    const gross = shoots * d.gross;
    const pgCost = shoots * d.pgCost;
    const net = shoots * d.fee; // 월 순매출 = 순수수료 합
    const profit = net - contentCost;
    // 손익분기 — 고정비를 덮으려면 하루에 몇 건이 필요한가 (입력과 같은 기준으로 환산)
    const bepShoots = d.fee > 0 ? contentCost / d.fee / days : Infinity;
    const bepPerDay = byInquiry ? (d.rate > 0 ? bepShoots / d.rate : Infinity) : bepShoots;
    return { shootsPerDay, shoots, gmv, gross, pgCost, net, profit, bepPerDay };
  }, [perDay, byInquiry, days, contentCost, shoot, d.rate, d.gross, d.pgCost, d.fee]);
  const cProfitColor = c.profit >= 0 ? "text-success" : "text-danger";

  // 합산 대시보드 — 유료(광고) 채널 + 콘텐츠 채널의 한 달 순이익
  //   유료: 문의 vol 건 × 성사율 = 촬영 건수, 비용은 문의 전체에 붙는 CPA
  //   콘텐츠: 위 섹션 그대로 (비용은 월 고정비)
  const t = useMemo(() => {
    const paidShoots = vol * d.rate;
    const paidNet = paidShoots * d.fee;
    const paidCost = vol * cpa; // 광고비는 성사 여부와 무관하게 문의 전부에 든다
    const paid = { shoots: paidShoots, net: paidNet, cost: paidCost, profit: paidNet - paidCost };
    const content = { shoots: c.shoots, net: c.net, cost: contentCost, profit: c.profit };

    const shoots = paid.shoots + content.shoots;
    const net = paid.net + content.net;
    const cost = paid.cost + content.cost;
    const profit = net - cost;
    return {
      paid,
      content,
      shoots,
      net,
      cost,
      profit,
      gmv: shoots * shoot,
      margin: net > 0 ? (profit / net) * 100 : 0,
      blendedCac: shoots > 0 ? cost / shoots : 0, // 촬영 1건 따오는 데 실제로 든 돈
      perShoot: shoots > 0 ? profit / shoots : 0,
    };
  }, [vol, cpa, shoot, d.rate, d.fee, c.shoots, c.net, c.profit, contentCost]);
  const tProfitColor = t.profit >= 0 ? "text-success" : "text-danger";

  const stateColor = d.positive ? "text-success" : "text-danger";
  const nearTake = TAKES.reduce((a, b) =>
    Math.abs(b - takePct) < Math.abs(a - takePct) ? b : a
  );
  const nearRate = RATES.reduce((a, b) =>
    Math.abs(b - ratePct) < Math.abs(a - ratePct) ? b : a
  );

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 font-kr sm:px-5">
      <h1 className="text-xl font-semibold text-fg">사매 건당 손익 계산기</h1>
      <p className="mt-2 w-fit rounded-lg border border-line bg-surface px-3 py-2 text-caption tabular-nums text-muted">
        순수수료 = <b className="text-fg">촬영비 × 요율 − PG</b> · 성사당 CPA ={" "}
        <b className="text-fg">문의당 CPA ÷ 성사율</b> · 건당 손익 ={" "}
        <b className="text-fg">순수수료 − 성사당 CPA</b>
      </p>

      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* 입력 */}
        <section className="space-y-5 rounded-2xl border border-line bg-surface p-4">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">입력</p>
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
            </p>
          </div>
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
          <div>
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
                  }}
                  className="cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5 text-caption text-muted transition-colors hover:border-fg/30 hover:text-fg"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 결과 */}
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">건당 손익</p>
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
              획득비용 {won(d.acq)}.
            </span>
          </div>

          <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-2 sm:grid-cols-5">
            {(
              [
                ["총수수료 (촬영비×요율)", won(d.gross)],
                [pgOn ? `PG ${pgPct}%` : "PG (꺼짐)", pgOn ? `−${won(d.pgCost)}` : "—"],
                ["순수수료", won(d.fee)],
                ["성사당 CPA", won(d.acq)],
                ["회수율 (매출÷비용)", `${isFinite(d.roas) ? d.roas.toFixed(2) : "∞"}×`],
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
                      : { text: `+${(d.needRate - ratePct).toFixed(1)}%p 필요`, tone: "bad" }
                }
              />
              <TargetRow
                name="필요 수수료율"
                value={isFinite(d.needTake) ? `${d.needTake.toFixed(1)}%` : "—"}
                gap={
                  d.needTake <= takePct
                    ? { text: "이미 충족", tone: "ok" }
                    : { text: `+${(d.needTake - takePct).toFixed(1)}%p 필요`, tone: "bad" }
                }
              />
              <TargetRow
                name="필요 순수수료"
                value={won(d.acq)}
                gap={
                  d.acq / Math.max(fee, 1) <= 1
                    ? { text: "이미 충족", tone: "ok" }
                    : { text: `${(d.acq / Math.max(fee, 1)).toFixed(2)}× 인상`, tone: "bad" }
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

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-dashed border-line-strong px-4 py-3">
            <label className="flex min-w-[200px] flex-1 items-center gap-3 text-caption text-muted">
              <span className="shrink-0">월 문의완료</span>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={vol}
                onChange={(e) => setVol(+e.target.value)}
                className="min-w-0 flex-1 cursor-pointer accent-fg"
              />
              <span className="shrink-0 text-body-sm font-semibold tabular-nums text-fg">
                {vol}건
              </span>
            </label>
            <p className="text-caption text-muted">
              월 손익{" "}
              <span className={`text-body font-semibold tabular-nums ${stateColor}`}>
                {signWon(d.monthly)}
              </span>
            </p>
          </div>
        </section>
      </div>

      {/* 민감도 매트릭스 */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wider text-faint">
            민감도 — 수수료율 × 성사율
          </p>
          <p className="text-caption text-muted">
            촬영비 <b className="tabular-nums text-fg">{won(shoot)}</b> · 문의당 CPA{" "}
            <b className="tabular-nums text-fg">{won(cpa)}</b>
            {pgOn && <> · PG {pgPct}% 포함</>} 기준 · 셀은 건당 손익
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
                      {won(shoot * ((t - (pgOn ? pgPct : 0)) / 100))}
                    </span>
                  </th>
                  {RATES.map((rp) => {
                    // 셀마다 요율이 다르므로 순수수료를 다시 구한다 (PG 는 켜져 있으면 전부에 적용)
                    const cellFee = shoot * ((t - (pgOn ? pgPct : 0)) / 100);
                    const pl = cellFee - cpa / (rp / 100);
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
          성사당 CPA는 문의당 CPA ÷ 성사율이므로, 성사율이 낮을수록 같은 광고비가 몇 배로
          불어나요. 회수율 1.0× 미만은 성사 1건마다 그만큼 손실이 난다는 뜻.
          <br />
          PG 를 붙이면 요율에서 {pgPct}%p 를 그냥 뺀 것과 같아요 — 결제 전액에 붙는데 작가
          정산액은 줄지 않으니까요. 요율 10%에 PG 를 켜면 실제로 남는 건 {(10 - pgPct).toFixed(1)}%
          입니다. 지금 계좌이체(에스크로)로 받는 건 이 비용이 없다는 뜻이기도 해요.
          <br />
          출장비는 수수료 대상이 아니라 촬영비만 넣으면 되고, 부가 매출(무빙컷 등)이 있으면
          촬영비에 더해서, 유기 유입 비중이 있으면 문의당 CPA에 유료 비중을 곱한 blended 값으로
          넣으면 돼요.
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
            {pgOn && <> · PG {pgPct}%</>} → 건당 순수수료{" "}
            <b className="tabular-nums text-fg">{won(fee)}</b>
          </p>
        </div>
        <p className="mt-2 w-fit rounded-lg border border-line bg-surface-2 px-3 py-2 text-caption tabular-nums text-muted">
          월 순매출 = <b className="text-fg">하루 촬영 건수 × 영업일 × 순수수료</b> · 월 순이익 ={" "}
          <b className="text-fg">월 순매출 − 콘텐츠 고정비</b>
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
              콘텐츠는 건당 광고비가 아니라 제작·운영에 매달 나가는 고정비로 잡아요 (인건비·외주·툴).
              유료 광고를 같이 돌리면 위쪽 CPA 계산기와 따로 보고 합치면 됩니다.
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
                    c.profit >= 0
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger"
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
                  [pgOn ? `월 PG ${pgPct}%` : "월 PG (꺼짐)", pgOn ? `−${won(c.pgCost)}` : "—"],
                  ["월 순매출", won(c.net)],
                  ["콘텐츠 고정비", `−${won(contentCost)}`],
                  [
                    "손익분기",
                    isFinite(c.bepPerDay)
                      ? `하루 ${c.bepPerDay.toFixed(2)}건`
                      : "불가능",
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="border-b border-line px-3.5 py-2.5 sm:border-r sm:last:border-r-0">
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
                    const profit = net - contentCost;
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
          콘텐츠는 한 번 만들면 계속 도는 대신 물량이 천천히 붙어요. 고정비는 그대로 나가니까
          하루 {isFinite(c.bepPerDay) ? c.bepPerDay.toFixed(2) : "—"}건을 넘기기 전까지는 적자,
          넘긴 다음부터는 건당 순수수료 {won(fee)}가 거의 그대로 이익으로 쌓입니다.
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
                sub: `월 문의 ${vol}건 · 성사율 ${ratePct}% · 문의당 CPA ${won(cpa)}`,
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
                  <span className={`text-body font-bold tabular-nums ${good ? "text-success" : "text-danger"}`}>
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

        <p className="mt-3 text-caption leading-relaxed text-faint">
          유료는 물량을 돈으로 살 수 있는 대신 건당 비용이 그대로 따라붙고, 콘텐츠는 고정비를
          넘긴 다음부터 건당 순수수료가 거의 통째로 남아요. 그래서 합산 순이익률은 콘텐츠 비중이
          커질수록 올라갑니다 — 지금은 순매출 대비 {t.margin.toFixed(0)}%.
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
