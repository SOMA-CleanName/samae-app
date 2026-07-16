"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState } from "@/components/ui";
import { ChevronDownIcon, ClipboardIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/hooks/useScrollLock";
import type { NewInquiry, AcceptedInquiry } from "@/lib/inquiries";
import { unlockInquiries, cancelInquiryUnlock, reportDepositPaid } from "./actions";

type Account = { bank: string; number: string; holder: string; notice: string };
const fmt = new Intl.NumberFormat("ko-KR");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 희망일 표시 — ISO(2026-05-17)면 "5.17(토)"로, 스킵값("미정" 등)은 그대로.
function prettyDate(v: string) {
  if (!ISO.test(v)) return v;
  const d = new Date(`${v}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getMonth() + 1}.${d.getDate()}(${WD[d.getDay()]})`;
}

// 도착 신선도 — 갓 들어온 리드일수록 "지금 잡아야 할" 느낌을 준다.
function freshness(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 3) return "방금 도착";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

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

// 접수 일시 (Asia/Seoul) — 예: "7월 16일 (수) 오후 3:15"
function receivedAt(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
              카드를 탭하면 사진·문의 내용이 펼쳐져요. 왼쪽 체크로 리드를 고른 뒤 아래에서 함께 해제하세요.
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

        {/* 해제 액션 바 — 항상 노출(미선택이면 비활성), 모바일에서도 닿는 sticky */}
        {newItems.length > 0 && (
          <div className="sticky bottom-4 z-10 mt-4">
            <button
              type="button"
              onClick={doUnlock}
              disabled={pending || selectedItems.length === 0}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-body-sm font-semibold shadow-lg transition-colors",
                selectedItems.length === 0
                  ? "cursor-default bg-surface-2 text-faint ring-1 ring-inset ring-line"
                  : "bg-fg text-bg hover:opacity-90 disabled:opacity-60"
              )}
            >
              {pending
                ? "해제하는 중…"
                : selectedItems.length === 0
                ? "해제할 리드를 선택하세요"
                : `해제하기 · ${selectedItems.length}건 · ₩${fmt.format(selectedTotal)}`}
            </button>
          </div>
        )}
      </section>

      {/* 입금 대기 (해제 신청 후 입금 확인 전) — 상단에 입금 계좌 안내 */}
      <AcceptedSection
        title="입금 대기"
        items={awaitingItems}
        emptyText="입금 대기 중인 리드가 없어요."
        intro={<PlatformAccountCard account={account} />}
      />

      {/* 입금 확인 (운영자 확인 완료 — 연락처 공개) */}
      <AcceptedSection
        title="입금 확인"
        items={confirmedItems}
        emptyText="입금 확인된 리드가 없어요."
      />

      {/* 계좌이체 안내 모달 */}
      {modalLeads && (
        <TransferModal leads={modalLeads} account={account} onClose={closeModal} />
      )}
    </div>
  );
}

// 받은 문의 카드 — 연락처만 잠금. 왼쪽 체크로 선택(일괄 해제용), 본문 탭하면 아코디언으로 펼쳐
// 좌측 큰 사진 + 우측 정보(희망날짜·위치·인원·문의사항·연락처) 나열. "이 리드를 사고 싶게" 만든다.
function NewInquiryCard({
  item,
  selected,
  onToggle,
}: {
  item: NewInquiry;
  selected: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = [
    item.preferred_date && `📅 ${prettyDate(item.preferred_date)}`,
    item.region && `📍 ${item.region}`,
    item.party_size && `👥 ${item.party_size}`,
  ].filter(Boolean) as string[];

  return (
    <li>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-surface transition-colors",
          selected
            ? "border-fg ring-1 ring-fg"
            : open
            ? "border-line-strong"
            : "border-line hover:border-line-strong"
        )}
      >
        {/* 요약행 — 본문 탭하면 펼침, 사진 좌상단 체크로 선택 */}
        <div className="relative flex items-stretch">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-3 text-left"
          >
            {/* 고객이 신청한 그 사진 — 시각적 후크 */}
            <div className="relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]">
              {item.source_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.source_photo.url} alt="신청한 사진" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-faint">
                  <ClipboardIcon className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <Badge tone="brand" className="shrink-0">
                  {item.purpose || "촬영 문의"}
                </Badge>
                <span className="shrink-0 text-caption text-faint">{freshness(item.created_at)}</span>
              </div>
              {meta.length > 0 && (
                <p className="mt-1.5 truncate text-caption text-muted">{meta.join("   ·   ")}</p>
              )}
            </div>
            <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
          </button>
          {/* 선택 체크 — 사진 좌상단 오버레이(별도 버튼, 펼침과 분리) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={selected ? "선택 해제" : "선택"}
            aria-pressed={selected}
            className="absolute left-2 top-2 z-10 p-1"
          >
            <span
              className={cn(
                "grid h-[22px] w-[22px] place-items-center rounded-md border-2 shadow-[0_1px_5px_rgba(0,0,0,0.5)] transition-colors",
                selected ? "border-fg bg-fg text-bg" : "border-white bg-black/50 text-transparent"
              )}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M5 10.5l3 3 7-7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        {/* 펼침 상세 — 좌측 큰 사진 + 우측 정보 세로나열 */}
        {open && (
          <div className="border-t border-line px-3 pb-3.5 pt-3.5">
            <div className="flex gap-4">
              {/* 좌측 큰 사진 */}
              <div className="w-32 shrink-0 sm:w-40">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-fg/[0.05]">
                  {item.source_photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.source_photo.url} alt="고객이 신청한 사진" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-faint">
                      <ClipboardIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
              </div>
              {/* 우측 정보 나열 — 문의 때 받은 질문 전부 */}
              <div className="min-w-0 flex-1 space-y-2">
                <InfoLine label="촬영목적">{item.purpose || "미정"}</InfoLine>
                <InfoLine label="희망날짜">
                  {item.preferred_date ? prettyDate(item.preferred_date) : "미정"}
                </InfoLine>
                <InfoLine label="희망위치">{item.region || "미정"}</InfoLine>
                <InfoLine label="인원">{item.party_size ? `${item.party_size}` : "미정"}</InfoLine>
                <InfoLine label="문의사항">
                  {item.note ? (
                    <span className="whitespace-pre-line font-normal">{item.note}</span>
                  ) : (
                    <span className="font-normal text-faint">없음</span>
                  )}
                </InfoLine>
                <InfoLine label="접수">{receivedAt(item.created_at)}</InfoLine>
                <InfoLine label="연락처">
                  <MaskedContact />
                </InfoLine>
              </div>
            </div>

            {/* 안내 — 일정·장소는 고객의 희망, 해제 후 협의 가능 */}
            <p className="mt-3 rounded-xl bg-brand/[0.07] px-3 py-2.5 text-caption leading-relaxed text-fg/75">
              💬 일정·장소는 고객이 적어둔 <b className="font-semibold text-fg">희망사항</b>이에요. 연락처를
              해제하고 직접 이야기 나누면 세부 조율도 얼마든지 가능해요.
            </p>

            {/* 고객 참고 사진 */}
            {item.ref_images.length > 0 && (
              <div className="mt-3.5">
                <p className="text-caption font-semibold text-muted">고객 참고 사진</p>
                <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-8">
                  {item.ref_images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="참고 사진" loading="lazy" className="aspect-square w-full rounded-lg bg-surface object-cover" />
                  ))}
                </div>
              </div>
            )}

            {/* 선택 토글 — 상세를 다 보고 바로 고를 수 있게 (해제는 하단 바에서 일괄) */}
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-body-sm font-semibold transition-colors",
                selected
                  ? "border-fg bg-fg text-bg"
                  : "border-line-strong text-fg hover:bg-fg/[0.04]"
              )}
            >
              {selected ? "✓ 선택됨 · 아래에서 해제" : `이 리드 선택 · ₩${fmt.format(item.deposit_amount_krw)}`}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// 정보 한 줄 — "라벨 : 값" 형식(라벨 폭 고정으로 콜론·값 정렬)
function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-body-sm leading-relaxed">
      <span className="w-[4.5rem] shrink-0 text-muted">{label}</span>
      <span className="shrink-0 text-faint">:</span>
      <span className="min-w-0 flex-1 font-medium text-fg">{children}</span>
    </div>
  );
}

// 잠긴 연락처 — 해제 전까지 모자이크(블러)로 티저. 실제 값은 select 안 하므로 더미 표시.
function MaskedContact() {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className="select-none rounded bg-fg/[0.07] px-2 py-0.5 font-medium tracking-[0.15em] text-fg/50 blur-[3px]"
      >
        010 1234 5678
      </span>
      <span className="inline-flex items-center gap-1 text-caption font-normal text-faint">
        <LockIcon className="h-3 w-3" /> 해제하면 공개
      </span>
    </span>
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
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90svh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-5 sm:rounded-3xl"
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
  emptyText,
  intro,
}: {
  title: string;
  items: AcceptedInquiry[];
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
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item) => (
              <AcceptedCard key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// 입금 계좌 안내 카드 — 입금 대기 섹션 상단에 한 번만. 계좌번호는 복사 버튼으로 바로 담기.
function PlatformAccountCard({ account }: { account: Account }) {
  const configured = account.bank && account.number;
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface-2 p-3.5">
      {configured ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-medium text-muted">입금 계좌</p>
            <p className="mt-0.5 truncate text-body font-semibold tabular-nums tracking-tight text-fg">
              {account.number}
            </p>
            <p className="mt-0.5 truncate text-caption text-muted">
              {account.bank} · 예금주 {account.holder}
            </p>
            {account.notice && <p className="mt-1 text-caption text-muted">{account.notice}</p>}
          </div>
          <CopyButton text={account.number} />
        </div>
      ) : (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">
          입금 계좌 안내가 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.
        </p>
      )}
      <p className="mt-2.5 text-caption text-muted">
        입금하시면 운영진이 확인 후 연락처를 공개해드려요.
      </p>
    </div>
  );
}

// 계좌번호 복사 버튼 — 클릭 시 클립보드에 담고 잠깐 "복사됨" 표시.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // 클립보드 접근 불가 환경은 조용히 무시
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]"
    >
      <ClipboardIcon className="h-3.5 w-3.5" />
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

// 진행 중 카드 — 받은 문의와 동일 형식(사진+정보 나열). 입금대기: 연락처 잠김+계좌/취소, 입금확인: 연락처 공개.
function AcceptedCard({ item }: { item: AcceptedInquiry }) {
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

  const meta = [
    item.preferred_date && `📅 ${prettyDate(item.preferred_date)}`,
    item.region && `📍 ${item.region}`,
    item.party_size && `👥 ${item.party_size}`,
  ].filter(Boolean) as string[];

  return (
    <li>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-surface transition-colors",
          open ? "border-line-strong" : "border-line hover:border-line-strong"
        )}
      >
        {/* 요약행 — 탭하면 펼침 */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 py-3 pl-3 pr-3 text-left"
        >
          <div className="relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]">
            {item.source_photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.source_photo.url} alt="신청한 사진" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-faint">
                <ClipboardIcon className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="brand" className="shrink-0">
                {item.purpose || "촬영 문의"}
              </Badge>
              <Badge tone={item.confirmed ? "success" : "warning"} className="shrink-0">
                {item.confirmed ? "입금확인" : "입금대기"}
              </Badge>
            </div>
            {meta.length > 0 && (
              <p className="mt-1.5 truncate text-caption text-muted">{meta.join("   ·   ")}</p>
            )}
          </div>
          <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
        </button>

        {/* 펼침 상세 — 좌측 큰 사진 + 우측 정보 나열 */}
        {open && (
          <div className="border-t border-line px-3 pb-3.5 pt-3.5">
            <div className="flex gap-4">
              <div className="w-32 shrink-0 sm:w-40">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-fg/[0.05]">
                  {item.source_photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.source_photo.url} alt="고객이 신청한 사진" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-faint">
                      <ClipboardIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <InfoLine label="촬영목적">{item.purpose || "미정"}</InfoLine>
                <InfoLine label="희망날짜">
                  {item.preferred_date ? prettyDate(item.preferred_date) : "미정"}
                </InfoLine>
                <InfoLine label="희망위치">{item.region || "미정"}</InfoLine>
                <InfoLine label="인원">{item.party_size ? `${item.party_size}` : "미정"}</InfoLine>
                <InfoLine label="문의사항">
                  {item.note ? (
                    <span className="whitespace-pre-line font-normal">{item.note}</span>
                  ) : (
                    <span className="font-normal text-faint">없음</span>
                  )}
                </InfoLine>
                <InfoLine label="접수">{receivedAt(item.created_at)}</InfoLine>
                {!item.confirmed && (
                  <InfoLine label="연락처">
                    <MaskedContact />
                  </InfoLine>
                )}
              </div>
            </div>

            {/* 고객 참고 사진 */}
            {item.ref_images.length > 0 && (
              <div className="mt-3.5">
                <p className="text-caption font-semibold text-muted">고객 참고 사진</p>
                <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-8">
                  {item.ref_images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="참고 사진" loading="lazy" className="aspect-square w-full rounded-lg bg-surface object-cover" />
                  ))}
                </div>
              </div>
            )}

            {/* 하단 — 입금대기: 계좌+취소 / 입금확인: 연락처 공개 */}
            <div className="mt-3.5">
              {item.confirmed ? (
                <ConfirmedContacts item={item} />
              ) : (
                <AwaitingDeposit
                  inquiryId={item.id}
                  amount={item.deposit_amount_krw}
                  reported={item.deposit_reported}
                  onCancel={cancel}
                  cancelling={cancelling}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

// 입금대기 카드 하단 — 계좌는 섹션 상단에 한 번만. 여기선 '입금완료' 신고 + 대기취소.
// 입금완료를 누르면 운영진 디스코드로 알림(예금주명·어드민 링크 포함)이 가고, 운영진이 대조 후 입금확인 처리.
function AwaitingDeposit({
  inquiryId,
  amount,
  reported,
  onCancel,
  cancelling,
}: {
  inquiryId: string;
  amount: number;
  reported: boolean;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const router = useRouter();
  const [reporting, startReport] = useTransition();
  const [sent, setSent] = useState(reported); // 낙관적 반영(새로고침 전에도 상태 유지)

  const report = () => {
    if (reporting) return;
    startReport(async () => {
      const res = await reportDepositPaid(inquiryId);
      if (res.ok) {
        setSent(true);
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      {sent ? (
        <p className="text-caption text-muted">
          <b className="text-success">✓ 입금완료 신고됨</b> · 운영진이 확인하면 연락처가 공개돼요.
          아직 확인 전이라면{" "}
          <button
            type="button"
            onClick={report}
            disabled={reporting}
            className="cursor-pointer font-medium text-fg underline underline-offset-2 hover:opacity-70 disabled:opacity-60"
          >
            {reporting ? "보내는 중…" : "다시 알림"}
          </button>
        </p>
      ) : (
        <>
          <p className="text-caption text-muted">
            위 계좌로 <b className="text-fg">₩{fmt.format(amount)}</b> 입금을 마치셨다면 아래 버튼을 눌러주세요.
            운영진이 입금을 확인하면 고객 연락처가 공개돼요.
          </p>
          <button
            type="button"
            onClick={report}
            disabled={reporting}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-fg px-5 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {reporting ? "신고하는 중…" : "입금완료"}
          </button>
        </>
      )}
      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="shrink-0 cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04] disabled:opacity-60"
        >
          {cancelling ? "취소 중…" : "입금대기 취소"}
        </button>
      </div>
    </div>
  );
}

// 입금확인 후 연락처 공개 — 브리프는 카드 정보 나열에 이미 있으므로 여기선 이름·연락 수단만.
function ConfirmedContacts({ item }: { item: AcceptedInquiry }) {
  const contacts: [string, string | null][] = [
    ["전화", item.phone],
    ["카카오", item.kakao_id],
    ["이메일", item.contact_email],
  ];
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-body-sm">
      <p className="text-caption font-semibold text-success">입금이 확인됐어요 · 연락처 공개</p>
      <div className="mt-2 space-y-2">
        {item.name && <InfoLine label="이름">{item.name}</InfoLine>}
        {contacts.some(([, v]) => v) ? (
          contacts.filter(([, v]) => v).map(([k, v]) => (
            <InfoLine key={k} label={k}>
              <span className="flex items-center justify-between gap-2">
                <span className={cn("min-w-0 truncate", k === "전화" && "tabular-nums tracking-tight")}>{v}</span>
                <CopyButton text={v as string} />
              </span>
            </InfoLine>
          ))
        ) : (
          <p className="text-caption text-faint">등록된 연락처가 없어요.</p>
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9V6.5a3 3 0 016 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
