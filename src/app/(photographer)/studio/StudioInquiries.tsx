"use client";

import { useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { ChevronDownIcon, MapPinIcon, ClipboardIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import type { NewInquiry, AcceptedInquiry } from "@/lib/inquiries";
import { acceptInquiry } from "./actions";

type Account = { bank: string; number: string; holder: string; notice: string };
const fmt = new Intl.NumberFormat("ko-KR");

function dt(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

export function StudioInquiries({
  newItems,
  acceptedItems,
  account,
}: {
  newItems: NewInquiry[];
  acceptedItems: AcceptedInquiry[];
  account: Account;
}) {
  return (
    <div className="space-y-8">
      {/* 받은 문의 (수락 전) */}
      <section>
        <h2 className="flex items-center gap-2 text-body font-semibold">
          받은 문의 <Badge tone={newItems.length > 0 ? "brand" : "neutral"}>{newItems.length}</Badge>
        </h2>
        {newItems.length === 0 ? (
          <EmptyState className="py-10" icon={<ClipboardIcon className="h-7 w-7" />} title="새 문의가 없어요" />
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {newItems.map((item) => (
              <NewInquiryCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      {/* 진행 중 (수락함) */}
      <section>
        <h2 className="text-body font-semibold">진행 중 {acceptedItems.length}</h2>
        {acceptedItems.length === 0 ? (
          <p className="mt-3 text-body-sm text-faint">수락한 문의가 여기에 쌓여요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {acceptedItems.map((item) => (
              <AcceptedRow key={item.id} item={item} account={account} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// 받은 문의 카드 — 브리프 + 수락. 연락처는 없음(수락+입금 후 공개)
function NewInquiryCard({ item }: { item: NewInquiry }) {
  const meta: [string, string | null][] = [
    ["희망일", item.preferred_date],
    ["지역", item.region || null],
    ["성별", item.gender],
    ["인원", item.party_size != null ? `${item.party_size}명` : null],
  ];
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-fg">{item.purpose}</p>
          <p className="mt-0.5 text-caption text-faint">
            {item.display_name || "비회원"} · {dt(item.created_at)}
          </p>
        </div>
        <Badge tone="warning" className="shrink-0">신규</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {meta.filter(([, v]) => v).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
            {k === "지역" && <MapPinIcon className="h-3 w-3 text-fg/45" />}
            <span className="text-faint">{k}</span> {v}
          </span>
        ))}
      </div>

      {item.note && <p className="mt-3 text-body-sm leading-relaxed text-fg/80">{item.note}</p>}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-caption text-muted">
          수락 후 <b className="text-fg">₩{fmt.format(item.deposit_amount_krw)}</b> 입금하면 고객 연락처가 공개돼요.
        </p>
        <form action={acceptInquiry}>
          <input type="hidden" name="id" value={item.id} />
          <button className="shrink-0 cursor-pointer rounded-full bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90">
            수락
          </button>
        </form>
      </div>
    </li>
  );
}

// 진행 중 행 — 입금대기/입금확인 배지 + 확장
function AcceptedRow({ item, account }: { item: AcceptedInquiry; account: Account }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Badge tone={item.confirmed ? "success" : "warning"} className="shrink-0">
          {item.confirmed ? "입금확인" : "입금대기"}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-fg">
          {item.display_name || "비회원"} · {item.purpose}
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {item.confirmed ? <ConfirmedDetail item={item} /> : <AwaitingDeposit account={account} amount={item.deposit_amount_krw} />}
        </div>
      )}
    </li>
  );
}

function AwaitingDeposit({ account, amount }: { account: Account; amount: number }) {
  const configured = account.bank && account.number;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <p className="text-body-sm font-semibold text-fg">입금 후 운영자 확인을 기다려요</p>
      <p className="mt-1 text-caption text-muted">
        아래 계좌로 <b className="text-fg">₩{fmt.format(amount)}</b> 입금하면, 운영자 확인 후 고객 연락처가 공개돼요.
      </p>
      {configured ? (
        <div className="mt-3 rounded-lg bg-surface p-3 text-body-sm">
          <Row label="은행" value={account.bank} />
          <Row label="계좌번호" value={account.number} mono />
          <Row label="예금주" value={account.holder} />
          {account.notice && <p className="mt-2 text-caption text-muted">{account.notice}</p>}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
          입금 계좌 안내가 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.
        </p>
      )}
    </div>
  );
}

function ConfirmedDetail({ item }: { item: AcceptedInquiry }) {
  const contacts: [string, string | null][] = [
    ["전화", item.phone],
    ["인스타", item.instagram_id],
    ["디스코드", item.discord_id],
    ["이메일", item.contact_email],
    ["기타", item.extra_contact],
  ];
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4 text-body-sm">
      <p className="text-caption font-semibold text-success">입금이 확인됐어요 · 연락처 공개</p>
      <div className="mt-2 space-y-0.5">
        <Row label="목적" value={item.purpose} />
        <Row label="희망일" value={item.preferred_date} />
        {item.region && <Row label="지역" value={item.region} />}
      </div>
      {item.note && <p className="mt-2 whitespace-pre-line text-fg/80">{item.note}</p>}
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-caption font-semibold text-muted">연락 수단</p>
        {contacts.some(([, v]) => v) ? (
          <div className="mt-1 space-y-0.5">
            {contacts.filter(([, v]) => v).map(([k, v]) => (
              <Row key={k} label={k} value={v as string} mono={k === "전화"} />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-caption text-faint">등록된 연락처가 없어요.</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="shrink-0 text-caption text-faint">{label}</span>
      <span className={cn("text-right font-medium text-fg", mono && "tabular-nums tracking-tight")}>{value}</span>
    </div>
  );
}
