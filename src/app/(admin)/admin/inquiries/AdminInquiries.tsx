"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Badge } from "@/components/ui";
import { ChevronDownIcon, MapPinIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { SelectCheckbox } from "@/components/admin/DeleteMode";
import { confirmInquiryDeposit, revertInquiryDeposit, setInquiryStatus, setInquiryHidden } from "./actions";

const fmt = new Intl.NumberFormat("ko-KR");

export type Stage = "new" | "await" | "confirmed" | "shot" | "refund";

export type InquiryRow = {
  id: string;
  stage: Stage;
  status: string;
  createdAt: string;
  photographerId: string;
  purpose: string;
  preferredDate: string;
  region: string | null;
  name: string | null;
  gender: string | null;
  partySize: string | null;
  note: string | null;
  depositAmount: number;
  photographerName: string;
  customerName: string;
  contacts: { label: string; value: string }[];
  contactLocked: boolean;
  refImages: string[];
  // 유입 — 어디서(광고/스토리/직접) 뭐타고(어떤 사진) 들어왔나
  channelLabel: string;
  channelKind: "ad" | "organic" | "direct" | "unknown";
  landingPath: string | null;
  isMember: boolean;
  sourcePhotoId: string | null;
  sourcePhotoThumb: string | null;
  sourcePhotoRegion: string | null;
  hidden: boolean; // 운영진이 작가에게서 숨김(취소)
};

const STAGE: Record<Stage, { label: string; tone: "warning" | "success" | "neutral" }> = {
  new: { label: "접수", tone: "neutral" },
  await: { label: "입금대기", tone: "warning" },
  confirmed: { label: "입금확인", tone: "success" },
  shot: { label: "촬영완료", tone: "neutral" },
  refund: { label: "환불신청", tone: "warning" },
};

const STATUS_OPTIONS = [
  { v: "new", l: "접수" },
  { v: "accepted", l: "입금대기" },
  { v: "confirmed", l: "입금확인" },
  { v: "shot", l: "촬영완료" },
  { v: "refund_requested", l: "환불신청" },
];

function dt(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

// 날짜 구분선용 (Asia/Seoul)
function dateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
// 입력은 최신순 정렬 가정 — 연속 같은 날짜끼리 묶는다
function groupByDate(rows: InquiryRow[]) {
  const groups: { key: string; label: string; items: InquiryRow[] }[] = [];
  for (const r of rows) {
    const key = dateKey(r.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(r);
    else groups.push({ key, label: dateLabel(r.createdAt), items: [r] });
  }
  return groups;
}

export function AdminInquiries({ rows }: { rows: InquiryRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-5">
      {groupByDate(rows).map((group) => (
        <div key={group.key}>
          {/* 날짜 구분선 */}
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-caption font-medium text-faint">{group.label}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {group.items.map((r) => {
              const st = STAGE[r.stage];
              const isOpen = open === r.id;
              return (
                <li key={r.id}>
            {/* 요약 행 — 컴팩트 */}
            <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <SelectCheckbox id={r.id} />
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Badge tone={st.tone} className="shrink-0">{st.label}</Badge>
                {r.channelKind === "ad" && (
                  <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    광고
                  </span>
                )}
                {r.channelKind === "organic" && (
                  <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                    스토리
                  </span>
                )}
                {r.hidden && (
                  <span className="shrink-0 rounded-full bg-fg/[0.08] px-2 py-0.5 text-[11px] font-semibold text-faint">
                    작가 숨김
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-fg">
                    {r.photographerName} <span className="text-faint">←</span> {r.customerName}
                  </span>
                  <span className="block truncate text-caption text-faint">
                    {r.purpose} · {dt(r.createdAt)}
                  </span>
                </span>
                <span className="hidden shrink-0 text-caption tabular-nums text-muted sm:block">
                  ₩{fmt.format(r.depositAmount)}
                </span>
                <ChevronDownIcon
                  className={cn("h-4 w-4 shrink-0 text-faint transition-transform", isOpen && "rotate-180")}
                />
              </button>

              {/* 인라인 액션 — 입금대기면 입금확인 버튼 */}
              {r.stage === "await" && (
                <form action={confirmInquiryDeposit} className="shrink-0">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="cursor-pointer rounded-full bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90">
                    입금확인
                  </button>
                </form>
              )}
            </div>

            {/* 확장 상세 */}
            {isOpen && (
              <div className="border-t border-line bg-fg/[0.015] px-4 py-4">
                {/* 메타 */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["희망일", r.preferredDate],
                    ["지역", r.region],
                    ["이름", r.name],
                    ["성별", r.gender],
                    ["인원", r.partySize],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
                        {k === "지역" && <MapPinIcon className="h-3 w-3 text-fg/45" />}
                        <span className="text-faint">{k}</span> {v}
                      </span>
                    ))}
                </div>

                {r.note && <p className="mt-3 text-body-sm leading-relaxed text-fg/80">{r.note}</p>}

                {/* 유입 경로 — 어디서(광고/스토리/직접) 뭐타고(어떤 사진) 들어왔나 */}
                <div className="mt-3">
                  <p className="text-caption font-medium text-muted">유입 경로</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium",
                        r.channelKind === "ad"
                          ? "bg-brand/10 text-brand"
                          : r.channelKind === "organic"
                            ? "bg-success/10 text-success"
                            : "bg-fg/[0.06] text-fg/70"
                      )}
                    >
                      {r.channelLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption text-fg/70">
                      {r.isMember ? "회원" : "비회원(게스트)"}
                    </span>
                    {r.sourcePhotoId && (
                      <a
                        href={`/photos/${r.sourcePhotoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] py-1 pl-1 pr-2.5 text-caption text-fg/70 transition-colors hover:bg-fg/[0.1]"
                      >
                        {r.sourcePhotoThumb ? (
                          <img src={r.sourcePhotoThumb} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : null}
                        이 사진 보고 문의{r.sourcePhotoRegion ? ` · ${r.sourcePhotoRegion}` : ""}
                      </a>
                    )}
                  </div>
                  {r.landingPath && (
                    <p className="mt-1.5 truncate text-[11px] text-faint" title={r.landingPath}>
                      랜딩: {r.landingPath}
                    </p>
                  )}
                </div>

                {/* 연락 수단 — 운영진은 응대 위해 항상 표시 */}
                <div className="mt-3">
                  <p className="text-caption font-medium text-muted">연락 수단</p>
                  {r.contacts.length === 0 ? (
                    <p className="mt-1 text-caption text-faint">등록된 연락처 없음</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                      {r.contacts.map((c) => (
                        <span key={c.label}>
                          <span className="text-faint">{c.label}</span>{" "}
                          <span className="font-medium text-fg select-all">{c.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 레퍼런스 사진 */}
                {r.refImages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.refImages.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg bg-fg/[0.05]">
                        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                {/* 운영 액션 */}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {r.stage === "confirmed" && (
                    <form action={revertInquiryDeposit}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04]">
                        입금확인 취소
                      </button>
                    </form>
                  )}
                  <form action={setInquiryStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <span className="text-caption text-muted">상태</span>
                    <select
                      name="status"
                      defaultValue={r.status}
                      className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-caption outline-none focus:border-fg/40"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v}>{o.l}</option>
                      ))}
                    </select>
                    <button className="cursor-pointer rounded-lg bg-fg px-3 py-1.5 text-caption font-semibold text-bg transition-opacity hover:opacity-90">
                      변경
                    </button>
                  </form>

                  {/* 작가에게서 숨기기(취소) — 어드민엔 남고 작가 목록에서만 사라짐 */}
                  <form action={setInquiryHidden} className="ml-auto">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="hidden" value={r.hidden ? "false" : "true"} />
                    <button
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-1.5 text-caption font-medium transition-colors",
                        r.hidden
                          ? "border-line-strong text-muted hover:bg-fg/[0.04]"
                          : "border-danger/40 text-danger hover:bg-danger/[0.06]"
                      )}
                    >
                      {r.hidden ? "작가에게 되돌리기" : "작가에게서 숨기기"}
                    </button>
                  </form>
                </div>
              </div>
            )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
