"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { ChevronDownIcon, ClipboardIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import type { NewInquiry, AcceptedInquiry } from "@/lib/inquiries";
import { unlockInquiries, cancelInquiryUnlock } from "./actions";

type Account = { bank: string; number: string; holder: string; notice: string };
const fmt = new Intl.NumberFormat("ko-KR");

// 모달에 넘길 해제 리드 스냅샷 (해제 직후 목록이 새로고침되기 전 보존)
// 입금 확인 전에는 사전정보를 일절 담지 않는다 — 받은 시각·금액만.
type UnlockedLead = { id: string; time: string; amount: number };

// 받은 시각(시:분만) — 날짜는 그룹 헤더가 담당
function timeOnly(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 그룹핑 키 (Asia/Seoul 기준 YYYY-MM-DD) — 서버/클라 동일하게 안정적
function dateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 날짜 구분선 라벨 (예: 6월 16일 (월))
function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 받은 문의를 받은 날짜별로 묶는다 (입력은 최신순 정렬 가정)
function groupByDate(items: NewInquiry[]) {
  const groups: { key: string; label: string; items: NewInquiry[] }[] = [];
  for (const item of items) {
    const key = dateKey(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dateLabel(item.created_at), items: [item] });
  }
  return groups;
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
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalLeads, setModalLeads] = useState<UnlockedLead[] | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = newItems.length > 0 && newItems.every((i) => selected.has(i.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(newItems.map((i) => i.id)));

  const selectedItems = newItems.filter((i) => selected.has(i.id));
  const selectedTotal = selectedItems.reduce((s, i) => s + i.deposit_amount_krw, 0);

  // 진행 중 = 입금 대기(미확인) / 입금 확인(confirmed) 으로 분리
  const awaitingItems = acceptedItems.filter((i) => !i.confirmed);
  const confirmedItems = acceptedItems.filter((i) => i.confirmed);

  // 해제하기 — 선택분 일괄 new→accepted 후 계좌이체 안내 모달 표시
  const doUnlock = () => {
    if (selectedItems.length === 0 || pending) return;
    const snapshot: UnlockedLead[] = selectedItems.map((i) => ({
      id: i.id,
      time: timeOnly(i.created_at),
      amount: i.deposit_amount_krw,
    }));
    startTransition(async () => {
      const res = await unlockInquiries(selectedItems.map((i) => i.id));
      if (res.ok && res.count > 0) {
        setModalLeads(snapshot);
        setSelected(new Set());
      }
    });
  };

  const closeModal = () => {
    setModalLeads(null);
    router.refresh(); // 해제분을 '진행 중'으로 반영
  };

  return (
    <div className="space-y-8">
      {/* 받은 문의 (수락 전) — 다중선택 후 일괄 해제 */}
      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            받은 문의 <Badge tone={newItems.length > 0 ? "brand" : "neutral"}>{newItems.length}</Badge>
          </h2>
          {newItems.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="cursor-pointer text-caption font-medium text-muted hover:text-fg"
            >
              {allSelected ? "선택 해제" : "전체 선택"}
            </button>
          )}
        </div>

        {newItems.length === 0 ? (
          <EmptyState className="py-10" icon={<ClipboardIcon className="h-7 w-7" />} title="새 문의가 없어요" />
        ) : (
          <>
            <p className="mt-1 text-caption text-faint">
              연락처를 받을 리드를 선택해 한 번에 해제하세요. 해제하면 입금 안내가 표시돼요.
            </p>
            <div className="mt-3 flex flex-col gap-5">
              {groupByDate(newItems).map((group) => (
                <div key={group.key}>
                  {/* 날짜 구분선 */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-caption font-medium text-faint">{group.label}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <ul className="mt-2 flex flex-col gap-2">
                    {group.items.map((item) => (
                      <NewInquiryCard
                        key={item.id}
                        item={item}
                        selected={selected.has(item.id)}
                        onToggle={() => toggle(item.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 해제 액션 바 — 선택이 있을 때만 (모바일에서도 닿는 sticky) */}
        {selectedItems.length > 0 && (
          <div className="sticky bottom-4 z-10 mt-4">
            <button
              type="button"
              onClick={doUnlock}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-fg px-5 py-3.5 text-body-sm font-semibold text-bg shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending
                ? "해제하는 중…"
                : `해제하기 · ${selectedItems.length}건 · ₩${fmt.format(selectedTotal)}`}
            </button>
          </div>
        )}
      </section>

      {/* 입금 대기 (해제 신청 후 입금 확인 전) — 상단에 입금 계좌 안내 */}
      <AcceptedSection
        title="입금 대기"
        items={awaitingItems}
        account={account}
        emptyText="입금 대기 중인 리드가 없어요."
        intro={<PlatformAccountCard account={account} />}
      />

      {/* 입금 확인 (운영자 확인 완료 — 연락처 공개) */}
      <AcceptedSection
        title="입금 확인"
        items={confirmedItems}
        account={account}
        emptyText="입금 확인된 리드가 없어요."
      />

      {/* 계좌이체 안내 모달 */}
      {modalLeads && (
        <TransferModal leads={modalLeads} account={account} onClose={closeModal} />
      )}
    </div>
  );
}

// 받은 문의 카드 — 잠긴 리드. 사전정보·연락처·닉네임 일절 미노출.
// 표시는 "있다"는 사실 + 받은 시각 + 해제 금액뿐(입금 확인 후에야 진행 중에서 공개).
function NewInquiryCard({
  item,
  selected,
  onToggle,
}: {
  item: NewInquiry;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface px-4 py-3.5 transition-colors",
          selected ? "border-fg ring-1 ring-fg" : "border-line hover:border-line-strong"
        )}
      >
        <Checkbox checked={selected} />
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-body-sm font-medium text-fg">
            <LockIcon className="h-3.5 w-3.5 text-faint" /> 잠긴 문의
          </p>
          <p className="mt-0.5 text-caption text-faint">{timeOnly(item.created_at)} 도착 · 사전정보 비공개</p>
        </div>
        <p className="shrink-0 text-caption text-muted">
          해제 <b className="text-fg">₩{fmt.format(item.deposit_amount_krw)}</b>
        </p>
      </div>
    </li>
  );
}

// 계좌이체 안내 모달 — 해제 신청 직후 표시. 총 입금액 + 운영진 계좌 + 대상 리드.
function TransferModal({
  leads,
  account,
  onClose,
}: {
  leads: UnlockedLead[];
  account: Account;
  onClose: () => void;
}) {
  const total = leads.reduce((s, l) => s + l.amount, 0);
  const configured = account.bank && account.number;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-body font-semibold text-fg">계좌이체 안내</p>
        <p className="mt-1 text-caption text-muted">
          {leads.length}건의 리드를 해제하려면 아래 계좌로 <b className="text-fg">총 ₩{fmt.format(total)}</b> 입금해주세요.
          입금 후 운영진 확인이 되면 연락처가 공개돼요.
        </p>

        {configured ? (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-body-sm">
            <Row label="은행" value={account.bank} />
            <Row label="계좌번호" value={account.number} mono />
            <Row label="예금주" value={account.holder} />
            <Row label="입금액" value={`₩${fmt.format(total)}`} />
            {account.notice && <p className="mt-2 text-caption text-muted">{account.notice}</p>}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-warning-soft px-3 py-2.5 text-caption text-warning">
            입금 계좌 안내가 아직 준비되지 않았어요. 잠시 후 ‘진행 중’ 목록에서 다시 확인해 주세요.
          </p>
        )}

        {/* 입금 후 카카오톡 통보 안내 */}
        <p className="mt-3 rounded-xl bg-brand/[0.07] px-3 py-2.5 text-caption text-fg/80">
          💬 입금하신 뒤 <b className="text-fg">SAMAE 카카오톡</b>으로 알려주세요. 운영진이 입금을 확인하면 연락처가 공개돼요.
        </p>

        {/* 대상 리드 — 사전정보 없이 건수/받은 시각만 */}
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-caption font-semibold text-muted">해제 신청한 리드 {leads.length}건</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {leads.map((l, idx) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-caption">
                <span className="min-w-0 truncate text-fg/80">
                  리드 {idx + 1} · {l.time} 도착
                </span>
                <span className="shrink-0 tabular-nums text-faint">₩{fmt.format(l.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full cursor-pointer rounded-full bg-fg px-5 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          확인
        </button>
      </div>
    </div>
  );
}

// 진행 중 섹션 — 입금 대기 / 입금 확인 공용. intro 는 헤더 아래 안내(입금 대기의 계좌 카드 등).
function AcceptedSection({
  title,
  items,
  account,
  emptyText,
  intro,
}: {
  title: string;
  items: AcceptedInquiry[];
  account: Account;
  emptyText: string;
  intro?: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-body font-semibold">
        {title} {items.length}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-body-sm text-faint">{emptyText}</p>
      ) : (
        <>
          {intro}
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {items.map((item) => (
              <AcceptedRow key={item.id} item={item} account={account} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// 입금 계좌 안내 카드 — 입금 대기 섹션 상단에 한 번 노출(행을 펼치지 않아도 보이게).
function PlatformAccountCard({ account }: { account: Account }) {
  const configured = account.bank && account.number;
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface-2 p-4">
      <p className="text-body-sm font-semibold text-fg">입금 계좌</p>
      {configured ? (
        <div className="mt-2 rounded-lg bg-surface p-3 text-body-sm">
          <Row label="은행" value={account.bank} />
          <Row label="계좌번호" value={account.number} mono />
          <Row label="예금주" value={account.holder} />
          {account.notice && <p className="mt-2 text-caption text-muted">{account.notice}</p>}
        </div>
      ) : (
        <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
          입금 계좌 안내가 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.
        </p>
      )}
      <p className="mt-2.5 rounded-lg bg-brand/[0.07] px-3 py-2 text-caption text-fg/80">
        💬 입금하신 뒤 <b className="text-fg">SAMAE 카카오톡</b>으로 알려주세요. 운영진이 입금을 확인하면 연락처가 공개돼요.
      </p>
    </div>
  );
}

// 진행 중 행 — 입금대기/입금확인 배지 + 확장
function AcceptedRow({ item, account }: { item: AcceptedInquiry; account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelling, startCancel] = useTransition();

  // 입금대기 취소 — 다시 받은 문의로 되돌린다(확인 후엔 불가)
  const cancel = () => {
    if (cancelling) return;
    if (!window.confirm("입금대기를 취소할까요? 이 리드는 다시 ‘받은 문의’로 돌아가요.")) return;
    startCancel(async () => {
      const res = await cancelInquiryUnlock(item.id);
      if (res.ok) router.refresh();
    });
  };

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
          {item.display_name || "비회원"}
        </span>
        <span className="shrink-0 text-caption text-faint">{timeOnly(item.created_at)} 접수</span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {item.confirmed ? (
            <ConfirmedDetail item={item} />
          ) : (
            <AwaitingDeposit
              account={account}
              amount={item.deposit_amount_krw}
              onCancel={cancel}
              cancelling={cancelling}
            />
          )}
        </div>
      )}
    </li>
  );
}

// 입금대기 행 펼침 — 계좌 정보(섹션 상단과 동일)도 여기서 다시 보여준다 + 금액 + 취소.
function AwaitingDeposit({
  account,
  amount,
  onCancel,
  cancelling,
}: {
  account: Account;
  amount: number;
  onCancel: () => void;
  cancelling: boolean;
}) {
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
      <p className="mt-2.5 rounded-lg bg-brand/[0.07] px-3 py-2 text-caption text-fg/80">
        💬 입금하신 뒤 <b className="text-fg">SAMAE 카카오톡</b>으로 알려주세요. 운영진이 입금을 확인하면 연락처가 공개돼요.
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="cursor-pointer rounded-full border border-line-strong px-3.5 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04] disabled:opacity-60"
        >
          {cancelling ? "취소하는 중…" : "입금대기 취소"}
        </button>
      </div>
    </div>
  );
}

function ConfirmedDetail({ item }: { item: AcceptedInquiry }) {
  const contacts: [string, string | null][] = [
    ["전화", item.phone],
    ["인스타 DM", item.instagram_id],
    ["카카오", item.discord_id], // discord_id 컬럼을 카카오 저장에 재사용
    ["기타", item.extra_contact],
  ];
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4 text-body-sm">
      <p className="text-caption font-semibold text-success">입금이 확인됐어요 · 연락처 공개</p>
      <div className="mt-2 space-y-0.5">
        <Row label="목적" value={item.purpose} />
        <Row label="희망일" value={item.preferred_date} />
        {item.region && <Row label="지역" value={item.region} />}
        {item.gender && <Row label="성별" value={item.gender} />}
        {item.party_size != null && <Row label="인원" value={`${item.party_size}명`} />}
      </div>
      {item.note && <p className="mt-2 whitespace-pre-line text-fg/80">{item.note}</p>}
      {item.ref_images.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold text-muted">참고 사진</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {item.ref_images.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-lg bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="참고 사진" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
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

// 선택 체크박스 (아이콘 의존 없이 인라인 SVG)
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
        checked ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface"
      )}
    >
      {checked && (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
          <path d="M5 10.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
