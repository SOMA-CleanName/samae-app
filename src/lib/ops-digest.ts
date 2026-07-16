import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { inquiryChannel } from "@/lib/inquiry-channel";

// 운영진 데일리 리포트 (디스코드 임베드) — 매일 09:00 KST 크론으로 하루 요약 1건 전송.
// 두 축을 한 카드에:
//   [상단] analytics_funnel RPC — 우리 자체 트래킹(analytics_events)으로 계산한
//          채널별 유입(순방문 세션) + 유입 퍼널(방문→사진조회→문의페이지→접수).
//          (Mixpanel 무료 플랜은 Query API 를 막아서 402 → 우리 데이터로 대체)
//   [하단] inquiries 테이블 — 접수(채널별) · 전환 퍼널(접수→수락→입금확정) · 매출.
// 리포트 전용 웹훅 — 미설정이면 통합 OPS 채널(DISCORD_OPS_WEBHOOK_URL)로 폴백(하위호환).
// 채널을 나누려면 디스코드에서 리포트 채널 웹훅을 만들어 DISCORD_DIGEST_WEBHOOK_URL 만 채우면 된다.
const OPS_WEBHOOK = process.env.DISCORD_DIGEST_WEBHOOK_URL || process.env.DISCORD_OPS_WEBHOOK_URL;
const KST = 9 * 60 * 60 * 1000; // Vercel 은 UTC 로 도니 KST 경계를 직접 계산
const DAY = 24 * 60 * 60 * 1000;
const FUNNEL_WINDOW_DAYS = 30; // 상단 퍼널·채널 유입 집계 창(저트래픽이라 30일로 표본 확보)
const won = new Intl.NumberFormat("ko-KR");
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export type DigestRange = "yesterday" | "today";

type InquiryRow = {
  created_at: string;
  status: string;
  deposit_confirmed_at: string | null;
  deposit_amount_krw: number | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  fbc: string | null;
};

type Field = { name: string; value: string; inline: boolean };

const CH = ["ad", "organic", "direct", "unknown"] as const;
type Ch = (typeof CH)[number];
const CH_LABEL: Record<Ch, string> = {
  ad: "🎯 광고",
  organic: "📱 스토리",
  direct: "🔗 직접",
  unknown: "❓ 불명",
};

function kstMidnightToday(now: Date): number {
  const k = new Date(now.getTime() + KST);
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST;
}
function kstDateLabel(ms: number): string {
  const k = new Date(ms + KST);
  return `${k.getUTCFullYear()}.${String(k.getUTCMonth() + 1).padStart(2, "0")}.${String(
    k.getUTCDate()
  ).padStart(2, "0")}`;
}

// utm_source 원시값 → 사람이 읽을 라벨
function srcLabel(src: string): string {
  const s = (src || "").toLowerCase();
  if (!s || s === "(direct)" || s === "undefined" || s === "null") return "🔗 직접·기타";
  if (/meta|facebook|fb/.test(s)) return `🎯 ${src}`;
  if (/insta|ig/.test(s)) return `📱 ${src}`;
  return `· ${src}`;
}

// 광고 소재명 축약: "컷툰_스냅_슬라이드" → "스냅"
function adLabel(content: string): string {
  return content.replace(/^컷툰[_\s]*/, "").replace(/[_\s]*슬라이드$/, "").trim() || content;
}

// [상단] 우리 트래킹(analytics_funnel RPC)으로 채널 유입 + 유입 퍼널 필드 생성.
// RPC 미적용(마이그레이션 전)이면 안내 필드 1개 반환.
async function topFunnelFields(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
  midToday: number,
  submittedActual: number // 실제 접수 수(inquiries) — 세션 기반 접수는 미계측이라 진짜 값 사용
): Promise<Field[]> {
  const fromISO = new Date(midToday - (FUNNEL_WINDOW_DAYS - 1) * DAY).toISOString();
  const toISO = now.toISOString();

  const { data, error } = await admin.rpc("analytics_funnel", { p_from: fromISO, p_to: toISO });
  if (error || !data) {
    return [
      {
        name: "📥 상단 퍼널·유입 (자체 트래킹)",
        value: "집계 함수 미적용 — `0059_analytics_funnel_fn.sql` 마이그레이션 실행 필요",
        inline: false,
      },
    ];
  }

  const d = data as {
    visitors: number;
    viewed_photo: number;
    reached_inquiry: number;
    submitted: number;
    channels: { src: string; n: number }[];
    ads: { content: string; visitors: number; viewed: number; inquiry: number }[];
  };

  const trafficLines =
    (d.channels ?? [])
      .slice(0, 6)
      .map((c) => `${srcLabel(c.src)}　${c.n}명 (${pct(c.n, d.visitors)}%)`)
      .join("\n") || "데이터 없음";

  const funnelLines = [
    `방문 **${d.visitors}명**`,
    `└ 사진 조회 ${d.viewed_photo} (${pct(d.viewed_photo, d.visitors)}%)`,
    `　└ 문의 페이지 ${d.reached_inquiry} (${pct(d.reached_inquiry, d.visitors)}%)`,
    `　　└ 문의 접수 **${submittedActual}** (${pct(submittedActual, d.visitors)}%)`,
  ].join("\n");

  // 인코딩된 utm_content(%EC%..)을 디코드해 같은 소재로 합침(일부 링크가 인코딩 저장됨)
  const adMap = new Map<string, { v: number; vp: number; ri: number }>();
  for (const a of d.ads ?? []) {
    let name = a.content;
    try {
      name = decodeURIComponent(a.content);
    } catch {
      /* 잘못된 인코딩은 원문 유지 */
    }
    const key = adLabel(name);
    const cur = adMap.get(key) ?? { v: 0, vp: 0, ri: 0 };
    cur.v += a.visitors;
    cur.vp += a.viewed;
    cur.ri += a.inquiry;
    adMap.set(key, cur);
  }
  const adsLines =
    [...adMap.entries()]
      .sort((a, b) => b[1].v - a[1].v)
      .slice(0, 6)
      .map(([name, x]) => `${name}　${x.v}명 → 조회 ${pct(x.vp, x.v)}% → 문의 ${pct(x.ri, x.v)}%`)
      .join("\n") || "데이터 없음";

  return [
    {
      name: `📥 유입 채널 · 최근 ${FUNNEL_WINDOW_DAYS}일 (순방문 ${d.visitors}명)`,
      value: trafficLines,
      inline: false,
    },
    {
      name: `🎬 메타 광고 소재별 · 최근 ${FUNNEL_WINDOW_DAYS}일 (방문→조회→문의)`,
      value: adsLines,
      inline: false,
    },
    { name: `🔻 유입 퍼널 · 최근 ${FUNNEL_WINDOW_DAYS}일`, value: funnelLines, inline: false },
  ];
}

/** 하루 요약(디스코드 임베드)을 운영 채널로 전송. 웹훅 미설정이면 조용히 패스. */
export async function sendDigest(
  range: DigestRange = "yesterday"
): Promise<{ ok: boolean; skipped?: string }> {
  if (!OPS_WEBHOOK) return { ok: false, skipped: "no_webhook" };

  const now = new Date();
  const midToday = kstMidnightToday(now);
  const start = range === "today" ? midToday : midToday - DAY; // 당일 구간 시작
  const end = range === "today" ? now.getTime() : midToday; // 당일 구간 끝
  const label = kstDateLabel(start);
  const rangeLabel = range === "today" ? "오늘 현재까지" : "어제";

  const admin = createAdminClient();

  // [하단] inquiries — 최근 30일 한 번에 당겨 JS 집계
  const since30 = new Date(midToday - 30 * DAY).toISOString();
  const { data } = await admin
    .from("inquiries")
    .select(
      "created_at, status, deposit_confirmed_at, deposit_amount_krw, utm_source, utm_medium, utm_campaign, fbc"
    )
    .gte("created_at", since30)
    .limit(10000);
  const rows = (data ?? []) as InquiryRow[];

  const within = (iso: string | null, s: number, e: number) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= s && t < e;
  };
  const chOf = (r: InquiryRow): Ch => inquiryChannel(r).kind;

  const primary = rows.filter((r) => within(r.created_at, start, end));
  const prev = rows.filter((r) => within(r.created_at, start - DAY, start));
  const last7 = rows.filter((r) => within(r.created_at, midToday - 7 * DAY, end));

  const primCh: Record<Ch, number> = { ad: 0, organic: 0, direct: 0, unknown: 0 };
  primary.forEach((r) => (primCh[chOf(r)] += 1));

  const total30 = rows.length;
  const accepted30 = rows.filter((r) => r.status !== "new").length;
  const confirmed30 = rows.filter((r) => r.deposit_confirmed_at).length;

  const agg: Record<Ch, { t: number; c: number }> = {
    ad: { t: 0, c: 0 },
    organic: { t: 0, c: 0 },
    direct: { t: 0, c: 0 },
    unknown: { t: 0, c: 0 },
  };
  rows.forEach((r) => {
    const k = chOf(r);
    agg[k].t += 1;
    if (r.deposit_confirmed_at) agg[k].c += 1;
  });

  const revPrimary = rows
    .filter((r) => within(r.deposit_confirmed_at, start, end))
    .reduce((s, r) => s + (r.deposit_amount_krw ?? 0), 0);
  const rev30 = rows
    .filter((r) => r.deposit_confirmed_at)
    .reduce((s, r) => s + (r.deposit_amount_krw ?? 0), 0);

  const diff = primary.length - prev.length;
  const diffTxt = diff === 0 ? "±0" : diff > 0 ? `+${diff}` : `${diff}`;

  const chLines =
    CH.filter((k) => primCh[k] > 0 || k !== "unknown")
      .map((k) => {
        const n = primCh[k];
        return `${CH_LABEL[k]} ${n}건${primary.length ? ` (${pct(n, primary.length)}%)` : ""}`;
      })
      .join("\n") || "없음";

  const funnelVal = [
    `접수 **${total30}**`,
    `└ 수락 ${accepted30} (${pct(accepted30, total30)}%)`,
    `　└ 입금확정 **${confirmed30}** (${pct(confirmed30, total30)}%)`,
  ].join("\n");

  const convLines =
    CH.filter((k) => agg[k].t > 0)
      .map((k) => {
        const { t, c } = agg[k];
        const warn = k === "ad" && t >= 3 && c === 0 ? "  ⚠️" : "";
        return `${CH_LABEL[k]}　${t} → ${c}　(${pct(c, t)}%)${warn}`;
      })
      .join("\n") || "데이터 없음";

  const topFields = await topFunnelFields(admin, now, midToday, total30);

  const embed = {
    title: "📊 사매 데일리 리포트",
    description: `**${label}**  ·  ${rangeLabel}`,
    color: 0xff5a5f,
    fields: [
      ...topFields,
      {
        name: `📨 문의 접수 ${primary.length}건`,
        value: `전일 대비 **${diffTxt}**　·　최근 7일 ${last7.length}건 (일평균 ${(
          last7.length / 7
        ).toFixed(1)})`,
        inline: false,
      },
      { name: "채널 분포(당일 접수)", value: chLines, inline: true },
      { name: "🔄 전환 퍼널 · 최근 30일", value: funnelVal, inline: false },
      { name: "📈 채널별 전환 · 30일 (접수→확정)", value: convLines, inline: false },
      {
        name: "💰 매출 (입금확정)",
        value: `오늘 ₩${won.format(revPrimary)}　·　30일 ₩${won.format(rev30)}`,
        inline: false,
      },
    ],
    footer: { text: "매일 09:00 KST 자동 발송 · 상단=방문/유입, 하단=문의/전환" },
  };

  try {
    const res = await fetch(OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      redirect: "manual",
    });
    return { ok: res.ok };
  } catch {
    return { ok: false, skipped: "post_failed" };
  }
}
