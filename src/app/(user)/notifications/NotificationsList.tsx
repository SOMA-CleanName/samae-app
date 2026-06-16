"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import type { AppNotification } from "@/lib/notifications";
import type { AcceptedInquiry } from "@/lib/inquiries";
import { Badge } from "@/components/ui";
import { ChevronDownIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { acceptInquiryNotifications } from "./actions";

type Account = { bank: string; number: string; holder: string; notice: string };
const fmtKrw = new Intl.NumberFormat("ko-KR");

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
  account,
}: {
  items: AppNotification[];
  acceptedItems: AcceptedInquiry[];
  account: Account;
}) {
  const [tab, setTab] = useState<"alerts" | "accepted">("alerts");
  const [alerts, setAlerts] = useState(items);
  const [acceptedList, setAcceptedList] = useState(acceptedItems);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectableItems = alerts.filter((item) => item.type === "booking" && item.inquiry_id);

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
        .filter((item) => acceptedSet.has(item.id) && item.type === "booking" && item.inquiry_id)
        .sort((a, b) => {
          if (ids.length === 1) return 0;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })
        .map(notificationToAcceptedInquiry);
      setAlerts((prev) => prev.filter((item) => !acceptedSet.has(item.id)));
      // 이미 목록에 있는 건(서버 데이터)과 중복되지 않게 머지 (중복 key 방지)
      setAcceptedList((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...moved.filter((m) => !seen.has(m.id))];
      });
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
              {selecting && n.type === "booking" && n.inquiry_id ? (
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

              {(() => {
                const isAlert = n.type === "booking" && !!n.inquiry_id;
                return (
                  <div className={`min-w-0 flex-1 ${isAlert ? "flex min-h-[44px] items-center" : ""}`}>
                    <div>
                      {display.title && <p className="text-sm font-bold">{display.title}</p>}
                      {display.body && (
                        <p
                          className={`whitespace-pre-line text-sm ${
                            isAlert ? "font-bold text-fg" : "mt-0.5 text-fg/60"
                          }`}
                        >
                          {display.body}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
              <span className="shrink-0 text-xs text-fg/40">{itemTimeLabel(n.created_at)}</span>
              {n.type === "booking" && n.inquiry_id && !selecting && (
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

      {tab === "accepted" && <AcceptedInquiryList items={acceptedList} account={account} />}

      {guideOpen && <AcceptGuideDialog account={account} onClose={() => setGuideOpen(false)} />}
    </>
  );
}

function AcceptedInquiryList({ items, account }: { items: AcceptedInquiry[]; account: Account }) {
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="mt-10 text-center text-sm text-fg/45">아직 수락한 예약이 없어요.</p>;
  }

  return (
    <div className="mt-3 space-y-5">
      {groupByDate(items, (item) => item.accepted_at).map((group) => (
        <section key={group.label}>
          <h2 className="mb-1 text-xs font-semibold text-fg/45">{group.label}</h2>
          <ul className="divide-y divide-fg/8">
            {group.items.map((item) => {
              const isOpen = open === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : item.id)}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <Badge tone={item.confirmed ? "success" : "warning"} className="shrink-0">
                      {item.confirmed ? "입금확인" : "입금대기"}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {acceptedInquiryName(item)} 님 예약
                    </span>
                    <span className="shrink-0 text-xs text-fg/40">{itemTimeLabel(item.accepted_at)}</span>
                    <ChevronDownIcon
                      className={cn("h-4 w-4 shrink-0 text-fg/40 transition-transform", isOpen && "rotate-180")}
                    />
                  </button>

                  {isOpen && (
                    <div className="pb-4">
                      {item.confirmed ? (
                        <ConfirmedDetail item={item} />
                      ) : (
                        <AwaitingDeposit account={account} amount={item.deposit_amount_krw} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// 입금 대기 — 우리 계좌 + 금액 안내, 연락처는 잠금
function AwaitingDeposit({ account, amount }: { account: Account; amount: number }) {
  const configured = account.bank && account.number;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold text-fg">입금 후 운영자 확인을 기다려요</p>
      <p className="mt-1 text-xs text-muted">
        아래 계좌로 <b className="text-fg">₩{fmtKrw.format(amount)}</b> 입금하시면, 운영자 확인 후
        고객 연락처가 공개돼요.
      </p>
      {configured ? (
        <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
          <Row label="은행" value={account.bank} />
          <Row label="계좌번호" value={account.number} mono />
          <Row label="예금주" value={account.holder} />
          {account.notice && <p className="mt-2 text-xs text-muted">{account.notice}</p>}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          입금 계좌 안내가 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.
        </p>
      )}
    </div>
  );
}

// 입금 확인됨 — 고객 연락처/문의 내용 공개
function ConfirmedDetail({ item }: { item: AcceptedInquiry }) {
  const contacts: [string, string | null][] = [
    ["전화", item.phone],
    ["인스타", item.instagram_id],
    ["디스코드", item.discord_id],
    ["이메일", item.contact_email],
    ["기타", item.extra_contact],
  ];
  const meta: [string, string | null][] = [
    ["목적", item.purpose],
    ["희망일", item.preferred_date],
    ["지역", item.region || null],
  ];
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
      <p className="text-xs font-semibold text-success">입금이 확인됐어요 · 연락처 공개</p>
      <div className="mt-2 space-y-0.5">
        {meta.filter(([, v]) => v).map(([k, v]) => (
          <Row key={k} label={k} value={v as string} />
        ))}
      </div>
      {item.note && <p className="mt-2 whitespace-pre-line text-fg/80">{item.note}</p>}
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-xs font-semibold text-muted">연락 수단</p>
        {contacts.some(([, v]) => v) ? (
          <div className="mt-1 space-y-0.5">
            {contacts.filter(([, v]) => v).map(([k, v]) => (
              <Row key={k} label={k} value={v as string} mono={k === "전화"} />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-fg/45">등록된 연락처가 없어요.</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="shrink-0 text-xs text-faint">{label}</span>
      <span className={cn("text-right font-medium text-fg", mono && "tabular-nums tracking-tight")}>{value}</span>
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
    extra_contact: null,
    purpose: "문의",
    preferred_date: "확인 필요",
    region: "",
    note: null,
    accepted_at: new Date().toISOString(),
    confirmed: false, // 방금 수락 = 입금 대기
    deposit_amount_krw: 6000,
  };
}

function acceptedInquiryName(item: AcceptedInquiry) {
  return item.display_name || item.instagram_id || item.contact_email || "비회원";
}

function AcceptGuideDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const configured = account.bank && account.number;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 font-kr" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-bg p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-fg">수락 완료 · 입금 안내</p>
        <p className="mt-1 text-sm text-muted">
          아래 계좌로 입금하시면 운영자 확인 후 고객 연락처가 공개돼요.
        </p>
        {configured ? (
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
            <Row label="은행" value={account.bank} />
            <Row label="계좌번호" value={account.number} mono />
            <Row label="예금주" value={account.holder} />
            {account.notice && <p className="mt-2 text-xs text-muted">{account.notice}</p>}
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            입금 계좌 안내가 아직 준비되지 않았어요. 예약 목록에서 다시 확인해 주세요.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function notificationDisplay(n: AppNotification) {
  // 문의 '수락 대기' 알림(booking)만 특수 표시. 그 외(입금확인 payment 등)는 일반 제목/본문.
  if (!n.inquiry_id || n.type !== "booking") {
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
