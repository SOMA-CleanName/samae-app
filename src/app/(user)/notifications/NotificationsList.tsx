"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import type { AppNotification } from "@/lib/notifications";
import type { AcceptedInquiry } from "@/lib/inquiries";
import { acceptInquiryNotifications } from "./actions";

const ACCEPT_GUIDE = "계좌번호: 국민 00000-00-000000입금바랍나다";

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
    if (last?.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
    return groups;
  }, []);
}

export function NotificationsList({
  items,
  acceptedItems,
}: {
  items: AppNotification[];
  acceptedItems: AcceptedInquiry[];
}) {
  const [tab, setTab] = useState<"alerts" | "accepted">("alerts");
  const [alerts, setAlerts] = useState(items);
  const [acceptedList, setAcceptedList] = useState(acceptedItems);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectableItems = alerts.filter((item) => item.inquiry_id);

  function toggleSelecting() {
    if (selecting) return;
    setSelecting(true);
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkAccept() {
    if (selected.size === 0) return;
    acceptSelected([...selected]);
  }

  function acceptAlert(id: string) {
    acceptSelected([id]);
  }

  function acceptSelected(ids: string[]) {
    startTransition(async () => {
      await acceptInquiryNotifications(ids);
      const acceptedSet = new Set(ids);
      const moved = alerts
        .filter((item) => acceptedSet.has(item.id) && item.inquiry_id)
        .sort((a, b) => {
          if (ids.length === 1) return 0;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .map(notificationToAcceptedInquiry);
      setAlerts((prev) => prev.filter((item) => !acceptedSet.has(item.id)));
      setAcceptedList((prev) => [...prev, ...moved]);
      setGuideOpen(true);
      cancelSelecting();
    });
  }

  function cancelSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  return (
    <>
      <div className="flex items-center gap-2 text-2xl font-semibold">
        <button
          type="button"
          onClick={() => setTab("alerts")}
          className={`cursor-pointer transition-colors ${tab === "alerts" ? "text-fg" : "text-fg/45 hover:text-fg"}`}
        >
          예약 알림
        </button>
        <span className="text-fg/25">|</span>
        <button
          type="button"
          onClick={() => setTab("accepted")}
          className={`cursor-pointer transition-colors ${tab === "accepted" ? "text-fg" : "text-fg/45 hover:text-fg"}`}
        >
          예약 목록
        </button>
      </div>

      <div className="mt-2 flex h-8 items-center justify-between gap-4">
        <div className="h-8 w-8">
          {tab === "alerts" && selecting && (
            <button
              type="button"
              onClick={cancelSelecting}
              aria-label="선택 취소"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-fg/55 transition-colors hover:bg-fg/[0.06] hover:text-fg"
            >
              &lt;
            </button>
          )}
        </div>
        <div>
          {tab === "alerts" && selectableItems.length > 0 && (
            <button
              type="button"
              onClick={selecting ? bulkAccept : toggleSelecting}
              disabled={pending}
              className={
                selecting
                  ? "cursor-pointer rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90"
                  : "cursor-pointer text-sm font-medium text-fg/55 hover:text-fg"
              }
            >
              {selecting ? "일괄 수락" : "여러개 선택하기"}
            </button>
          )}
        </div>
      </div>

      {tab === "alerts" && alerts.length === 0 && (
        <p className="mt-10 text-center text-sm text-fg/45">아직 예약 알림이 없어요.</p>
      )}

      {tab === "alerts" && alerts.length > 0 && (
        <div className="mt-3 space-y-5">
        {groupByDate(alerts, (item) => item.created_at).map((group) => (
          <section key={group.label}>
            <h2 className="mb-1 text-xs font-semibold text-fg/45">{group.label}</h2>
            <ul className="divide-y divide-fg/8">
        {group.items.map((n) => {
          const display = notificationDisplay(n);
          const checked = selected.has(n.id);
          const inner = (
            <div className={`flex items-center gap-3 py-3 ${n.read_at ? "" : "bg-brand/[0.03]"}`}>
              {selecting && n.inquiry_id ? (
                <button
                  type="button"
                  onClick={() => toggleItem(n.id)}
                  aria-pressed={checked}
                  aria-label={checked ? "선택 해제" : "선택"}
                  className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border border-line-strong text-[12px] font-bold text-bg"
                >
                  {checked && <span className="grid h-full w-full place-items-center rounded-sm bg-fg">v</span>}
                </button>
              ) : (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    n.read_at ? "bg-transparent" : "bg-brand"
                  }`}
                />
              )}

              <div className={`min-w-0 flex-1 ${n.inquiry_id ? "flex min-h-[44px] items-center" : ""}`}>
                <div>
                  {display.title && <p className="text-sm font-bold">{display.title}</p>}
                  {display.body && (
                    <p
                      className={`whitespace-pre-line text-sm ${
                        n.inquiry_id ? "font-bold text-fg" : "mt-0.5 text-fg/60"
                      }`}
                    >
                      {display.body}
                    </p>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-xs text-fg/40">{itemTimeLabel(n.created_at)}</span>
              {n.inquiry_id && !selecting && (
                <button
                  type="button"
                  onClick={() => acceptAlert(n.id)}
                  disabled={pending}
                  className="shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg transition-opacity hover:opacity-90"
                >
                  수락
                </button>
              )}
            </div>
          );

          return (
            <li key={n.id}>
              {n.link && !n.inquiry_id && !selecting ? (
                <Link href={n.link} className="block hover:bg-fg/[0.02]">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
            </ul>
          </section>
        ))}
        </div>
      )}

      {tab === "accepted" && <AcceptedInquiryList items={acceptedList} />}

      {guideOpen && <AcceptGuideDialog onClose={() => setGuideOpen(false)} />}
    </>
  );
}

function AcceptedInquiryList({ items }: { items: AcceptedInquiry[] }) {
  if (items.length === 0) {
    return <p className="mt-10 text-center text-sm text-fg/45">아직 수락한 예약이 없어요.</p>;
  }

  return (
    <div className="mt-3 space-y-5">
      {groupByDate(items, (item) => item.accepted_at).map((group) => (
        <section key={group.label}>
          <h2 className="mb-1 text-xs font-semibold text-fg/45">{group.label}</h2>
          <ul className="divide-y divide-fg/8">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-transparent" />
                <div className="flex min-h-[44px] min-w-0 flex-1 items-center">
                  <div>
                    <p className="text-sm font-bold">{acceptedInquiryName(item)} 님 예약</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-fg/40">{itemTimeLabel(item.accepted_at)}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="invisible shrink-0 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg"
                >
                  수락
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function notificationToAcceptedInquiry(notification: AppNotification): AcceptedInquiry {
  const display = notificationDisplay(notification);
  const name = display.body.replace(" 님이 예약 문의를 하였습니다.", "") || "비회원";
  return {
    id: notification.inquiry_id ?? notification.id,
    display_name: name === "비회원" ? null : name,
    phone: null,
    instagram_id: null,
    discord_id: null,
    contact_email: null,
    purpose: "문의",
    preferred_date: "확인 필요",
    region: "확인 필요",
    accepted_at: new Date().toISOString(),
  };
}

function acceptedInquiryName(item: AcceptedInquiry) {
  return item.display_name || item.instagram_id || item.contact_email || "비회원";
}

function AcceptGuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 font-kr">
      <div className="w-full max-w-sm rounded-2xl bg-bg p-5 text-center shadow-pop">
        <p className="text-base font-semibold text-fg">{ACCEPT_GUIDE}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function notificationDisplay(n: AppNotification) {
  if (!n.inquiry_id) {
    return { title: n.title, body: n.body ? n.body.split("\n")[0] : "" };
  }

  const firstBodyLine = n.body ? n.body.split("\n")[0] : "";
  const inquiryLine = [n.title, firstBodyLine].find((text) =>
    text.includes("님이 예약 문의를 하였습니다.")
  );

  return {
    title: "",
    body: inquiryLine ?? firstBodyLine,
  };
}
