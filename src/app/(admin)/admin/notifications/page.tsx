import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { BellIcon } from "@/components/user/icons";
import { NOTIFY_KINDS, NOTIFY_TEMPLATES, isNotifyKind } from "@/lib/notify-templates";
import { alimtalkAvailable, alimtalkPfId } from "@/lib/alimtalk";
import { smsConfigured } from "@/lib/sms";
import { resendNotification } from "./actions";

export const dynamic = "force-dynamic";

// 어드민 · 알림 발송 이력 — notification_queue 를 눈으로 본다.
// 운영 목적: (1) 알림톡이 실제로 나가는지 (2) failed 를 잡아 재발송 (3) 채널 설정이 빠진 kind 확인.
// 발송 자체는 여기서 하지 않는다 — 트리거는 거래 흐름(docs/34 §4)에 있다.

type Row = {
  id: string;
  kind: string;
  channel: "sms" | "alimtalk";
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  phone: string | null;
  body: string;
  variables: Record<string, string> | null;
  created_at: string;
  sent_at: string | null;
  profile: { display_name: string | null } | { display_name: string | null }[] | null;
};

const STATUSES = ["sent", "failed", "skipped", "pending"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  sent: "발송",
  failed: "실패",
  skipped: "건너뜀",
  pending: "대기",
};
const STATUS_TONE: Record<Status, "success" | "danger" | "neutral" | "warning"> = {
  sent: "success",
  failed: "danger",
  skipped: "neutral",
  pending: "warning",
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

function when(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

// 번호는 뒷자리만 — 목록에서 전체 번호가 보일 이유가 없다
function maskPhone(p: string | null): string {
  if (!p) return "번호 없음";
  const d = p.replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : "****";
}

// 큐의 skipped 사유 — 코드로 남긴 걸 사람 말로
function reasonLabel(status: Status, error: string | null): string | null {
  if (!error) return null;
  if (error === "no_phone") return "수신자 전화번호 없음";
  if (error === "dev") return "dev 환경 (실발송 꺼짐)";
  if (error.startsWith("alimtalk_fallback:")) return `알림톡 거부 → 문자로 대체 (${error.slice(18).trim()})`;
  return status === "failed" ? error : error;
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; kind?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const statusFilter = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : null;
  const kindFilter = isNotifyKind(sp.kind) ? sp.kind : null;

  const admin = createAdminClient();
  let q = admin
    .from("notification_queue")
    .select(
      "id, kind, channel, status, error, phone, body, variables, created_at, sent_at, profile:profiles(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (statusFilter) q = q.eq("status", statusFilter);
  if (kindFilter) q = q.eq("kind", kindFilter);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  // 상태별 개수는 필터와 무관하게 — 필터 칩에 숫자를 달기 위해 (최근 200건 기준)
  const { data: recent } = await admin
    .from("notification_queue")
    .select("status")
    .order("created_at", { ascending: false })
    .limit(200);
  const counts = STATUSES.map((s) => ({
    status: s,
    n: (recent ?? []).filter((r) => r.status === s).length,
  }));

  // 채널 설정 현황 — "왜 문자로 나갔지?" 의 답이 여기 있다
  const solapiOn = smsConfigured();
  const pfOn = !!alimtalkPfId();
  const kindReady = NOTIFY_KINDS.map((k) => ({ kind: k, ready: alimtalkAvailable(k) }));
  const readyCount = kindReady.filter((k) => k.ready).length;

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-caption font-medium transition-colors ${
      active ? "bg-fg text-bg" : "bg-fg/[0.06] text-muted hover:bg-fg/10"
    }`;
  const qs = (patch: { status?: string | null; kind?: string | null }) => {
    const p = new URLSearchParams();
    const s = patch.status === undefined ? statusFilter : patch.status;
    const k = patch.kind === undefined ? kindFilter : patch.kind;
    if (s) p.set("status", s);
    if (k) p.set("kind", k);
    const str = p.toString();
    return `/admin/notifications${str ? `?${str}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-5">
      <h1 className="text-h1 font-semibold">알림 발송 이력</h1>
      <p className="mt-1 text-body-sm text-muted">
        앱 밖으로 나간 알림톡·문자 (최근 200건) · 발송은 거래 흐름에서 자동으로 일어난다
      </p>

      {/* 설정 현황 — 알림톡이 안 나가면 십중팔구 여기 뭔가 비어 있다 */}
      <div className="mt-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <p className="text-body-sm font-semibold">채널 설정</p>
        <div className="mt-2 flex flex-wrap gap-2 text-caption">
          <Badge tone={solapiOn ? "success" : "danger"}>솔라피 키 {solapiOn ? "설정됨" : "없음 (스텁)"}</Badge>
          <Badge tone={pfOn ? "success" : "warning"}>카카오 채널 {pfOn ? "연동됨" : "미연동 → 전부 문자"}</Badge>
          <Badge tone={readyCount === NOTIFY_KINDS.length ? "success" : readyCount > 0 ? "warning" : "neutral"}>
            알림톡 템플릿 {readyCount}/{NOTIFY_KINDS.length}
          </Badge>
        </div>
        <ul className="mt-3 grid gap-1 text-caption text-muted sm:grid-cols-2">
          {kindReady.map((k) => (
            <li key={k.kind} className="flex items-center gap-2">
              <span className={k.ready ? "text-success" : "text-faint"}>{k.ready ? "●" : "○"}</span>
              <span className="text-fg">{NOTIFY_TEMPLATES[k.kind].label}</span>
              <span className="font-mono text-faint">{k.kind}</span>
              {!k.ready && <span className="text-faint">→ 문자</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-caption text-faint">템플릿 등록·심사 절차는 docs/34-kakao-alimtalk.md</p>
      </div>

      {/* 필터 — 상태 × 종류 */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link href={qs({ status: null })} className={chip(!statusFilter)}>
          전체
        </Link>
        {counts.map((c) => (
          <Link key={c.status} href={qs({ status: c.status })} className={chip(statusFilter === c.status)}>
            {STATUS_LABEL[c.status]} {c.n}
          </Link>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Link href={qs({ kind: null })} className={chip(!kindFilter)}>
          모든 종류
        </Link>
        {NOTIFY_KINDS.map((k) => (
          <Link key={k} href={qs({ kind: k })} className={chip(kindFilter === k)}>
            {NOTIFY_TEMPLATES[k].label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<BellIcon className="h-7 w-7" />}
          title="발송 기록이 없어요"
          description="작가 답장·예약·입금·정산이 일어나면 여기에 쌓여요."
        />
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          {rows.map((r) => {
            const kindLabel = isNotifyKind(r.kind) ? NOTIFY_TEMPLATES[r.kind].label : r.kind;
            const reason = reasonLabel(r.status, r.error);
            const canResend = r.status !== "sent" && !!r.variables && isNotifyKind(r.kind);
            return (
              <li key={r.id} className="px-4 py-3.5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-fg">
                      <span>{kindLabel}</span>
                      <Badge tone={r.channel === "alimtalk" ? "brand" : "neutral"}>
                        {r.channel === "alimtalk" ? "알림톡" : "문자"}
                      </Badge>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      <span className="font-normal text-muted">
                        → {one(r.profile)?.display_name ?? "수신자"} · {maskPhone(r.phone)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-caption text-muted">{r.body}</p>
                    {reason && (
                      <p className={`mt-1 text-caption ${r.status === "failed" ? "text-danger" : "text-faint"}`}>
                        {reason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 text-caption text-faint">
                    <p>{when(r.sent_at ?? r.created_at)}</p>
                    {canResend && (
                      <form action={resendNotification}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-caption font-semibold text-fg transition-colors hover:bg-surface-2"
                        >
                          다시 보내기
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
