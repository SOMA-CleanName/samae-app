import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 어드민 · 대화방 뷰어 — 읽기 전용 트랜스크립트 (봇/고객/작가/요약 구분) + SMS 발송 이력
type Msg = {
  id: string;
  sender_id: string;
  type: string;
  body: string;
  image_path: string | null;
  created_at: string;
};

function ts(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

export default async function AdminChatViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: convRaw } = await admin
    .from("conversations")
    .select(
      "id, user_id, photographer_id, user_unread, photographer_unread, " +
        "photographer:photographers(display_name, profile_id), user:profiles!conversations_user_id_fkey(display_name, phone)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!convRaw) notFound();
  const conv = convRaw as unknown as {
    id: string;
    user_id: string;
    photographer_id: string;
    user_unread: number;
    photographer_unread: number;
    photographer: { display_name: string | null; profile_id: string } | null;
    user: { display_name: string | null; phone: string | null } | null;
  };
  const photographer = conv.photographer;
  const customer = conv.user;

  const [{ data: msgs }, { data: smsRows }, { data: modRows }] = await Promise.all([
    admin
      .from("messages")
      .select("id, sender_id, type, body, image_path, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(500),
    admin
      .from("notification_queue")
      .select("status, error, body, created_at, sent_at")
      .eq("dedupe_key", `chat_reply:${id}`)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("moderation_events")
      .select("sender_role, body, matched, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const messages = (msgs ?? []) as Msg[];

  // 화자 라벨 — sender + type 으로 구분
  const speaker = (m: Msg): { label: string; tone: string } => {
    if (m.type === "summary_card") return { label: "요약", tone: "text-brand" };
    if (m.type === "system") return { label: "시스템", tone: "text-faint" };
    const isCustomer = m.sender_id === conv.user_id;
    if (m.type === "bot")
      return isCustomer
        ? { label: `${customer?.display_name ?? "고객"} (봇 수집)`, tone: "text-fg" }
        : { label: "봇 (자동 응답)", tone: "text-muted" };
    return isCustomer
      ? { label: customer?.display_name ?? "고객", tone: "text-fg" }
      : { label: `${photographer?.display_name ?? "작가"} ✍️`, tone: "text-success" };
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-5">
      <Link href="/admin/chats" className="text-caption text-muted hover:text-fg">
        ← 채팅 목록
      </Link>
      <h1 className="mt-2 text-h1 font-semibold">
        {customer?.display_name ?? "고객"} → {photographer?.display_name ?? "작가"}
      </h1>
      <p className="mt-1 text-caption text-muted">
        메시지 {messages.length}개 · 고객 연락처 {customer?.phone ?? "없음"} · 안읽음(고객{" "}
        {conv.user_unread} / 작가 {conv.photographer_unread})
      </p>

      {/* 오프플랫폼 유도 차단 시도 — 메시지는 저장되지 않았고 여기에만 원문이 남는다 */}
      {(modRows ?? []).length > 0 && (
        <div className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-caption leading-relaxed">
          <p className="font-semibold text-danger">
            ⚠️ 오프플랫폼 유도 차단 {(modRows ?? []).length}건
          </p>
          {(modRows ?? []).map((e, i) => (
            <div key={i} className="mt-2 border-t border-danger/20 pt-2">
              <p className="text-danger">
                {ts(e.created_at as string)} ·{" "}
                <b className="font-semibold">
                  {e.sender_role === "photographer" ? "작가" : "고객"}
                </b>{" "}
                · {(e.matched as string[]).join(", ")}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-fg">{e.body as string}</p>
            </div>
          ))}
        </div>
      )}

      {/* SMS 발송 이력 */}
      {(smsRows ?? []).length > 0 && (
        <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-caption leading-relaxed">
          <p className="font-semibold text-fg">재소환 SMS 이력</p>
          {(smsRows ?? []).map((s, i) => (
            <p key={i} className="mt-1 text-muted">
              {ts(s.created_at as string)} · <b className="font-semibold">{s.status as string}</b>
              {s.error ? ` (${s.error})` : ""}
            </p>
          ))}
        </div>
      )}

      {/* 트랜스크립트 */}
      <ol className="mt-5 space-y-2.5">
        {messages.map((m) => {
          const sp = speaker(m);
          return (
            <li key={m.id} className="rounded-xl bg-surface px-4 py-2.5 ring-1 ring-line">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-caption font-semibold ${sp.tone}`}>{sp.label}</span>
                <span className="shrink-0 text-label text-faint">{ts(m.created_at)}</span>
              </div>
              {m.type === "summary_card" ? (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-brand-soft/40 p-2 text-caption text-fg">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(m.body), null, 1);
                    } catch {
                      return m.body;
                    }
                  })()}
                </pre>
              ) : m.type === "image" && m.image_path ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={m.image_path} alt="" className="mt-1 max-h-48 rounded-lg object-cover" />
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-body-sm text-fg">{m.body}</p>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
