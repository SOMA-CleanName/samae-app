import Link from "next/link";
import type { AppNotification } from "@/lib/notifications";

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function dateGroupLabel(iso: string): string {
  if (isToday(iso)) return "오늘";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function itemTimeLabel(iso: string): string {
  if (isToday(iso)) return ago(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function groupByDate<T>(items: T[], getIso: (item: T) => string) {
  return items.reduce<Array<{ label: string; items: T[] }>>((groups, item) => {
    const label = dateGroupLabel(getIso(item));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
}

// 알림 클릭 시 이동할 경로 — 문의/입금 관련은 스튜디오 허브로
function linkFor(n: AppNotification): string {
  if (n.type === "booking" || n.type === "payment") return "/studio";
  return n.link ?? "/studio";
}

function display(n: AppNotification) {
  return { title: n.title, body: n.body ? n.body.split("\n")[0] : "" };
}

// 알림 목록 — redirect-only. 실제 처리(수락·입금·연락처)는 스튜디오에서.
export function NotificationsList({ items }: { items: AppNotification[] }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">알림</h1>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-fg/45">새 알림이 없어요.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {groupByDate(items, (n) => n.created_at).map((group) => (
            <section key={group.label}>
              <h2 className="mb-1 text-xs font-semibold text-fg/45">{group.label}</h2>
              <ul className="divide-y divide-fg/8">
                {group.items.map((n) => {
                  const d = display(n);
                  return (
                    <li key={n.id}>
                      <Link
                        href={linkFor(n)}
                        className={`flex items-center gap-3 py-3 transition-colors hover:bg-fg/[0.02] ${
                          n.read_at ? "" : "bg-brand/[0.03]"
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`} />
                        <div className="min-w-0 flex-1">
                          {d.title && <p className="truncate text-sm font-semibold text-fg">{d.title}</p>}
                          {d.body && <p className="mt-0.5 truncate text-sm text-fg/60">{d.body}</p>}
                        </div>
                        <span className="shrink-0 text-xs text-fg/40">{itemTimeLabel(n.created_at)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
