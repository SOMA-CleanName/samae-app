"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Badge } from "@/components/ui";
import { ChevronDownIcon, MapPinIcon } from "@/components/user/icons";
import { cn } from "@/lib/cn";
import { confirmInquiryDeposit, revertInquiryDeposit, setInquiryStatus } from "./actions";

const fmt = new Intl.NumberFormat("ko-KR");

export type Stage = "new" | "await" | "confirmed" | "done";

export type InquiryRow = {
  id: string;
  stage: Stage;
  status: string;
  createdAt: string;
  purpose: string;
  preferredDate: string;
  region: string | null;
  gender: string | null;
  partySize: number | null;
  note: string | null;
  depositAmount: number;
  photographerName: string;
  customerName: string;
  contacts: { label: string; value: string }[]; // 입금확인 후에만 채워짐
  contactLocked: boolean;
  refImages: string[];
};

const STAGE: Record<Stage, { label: string; tone: "warning" | "success" | "neutral" }> = {
  new: { label: "접수", tone: "neutral" },
  await: { label: "입금대기", tone: "warning" },
  confirmed: { label: "입금확인", tone: "success" },
  done: { label: "종료", tone: "neutral" },
};

const STATUS_OPTIONS = [
  { v: "new", l: "접수" },
  { v: "accepted", l: "입금대기" },
  { v: "confirmed", l: "입금확인" },
  { v: "contacted", l: "연락함" },
  { v: "converted", l: "전환" },
  { v: "closed", l: "종료" },
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

export function AdminInquiries({ rows }: { rows: InquiryRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => {
        const st = STAGE[r.stage];
        const isOpen = open === r.id;
        return (
          <li key={r.id}>
            {/* 요약 행 — 컴팩트 */}
            <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Badge tone={st.tone} className="shrink-0">{st.label}</Badge>
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
                    ["성별", r.gender],
                    ["인원", r.partySize != null ? `${r.partySize}명` : null],
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

                {/* 연락 수단 — 입금확인 후 공개 */}
                <div className="mt-3">
                  <p className="text-caption font-medium text-muted">연락 수단</p>
                  {r.contactLocked ? (
                    <p className="mt-1 text-caption text-faint">입금 확인 후 공개돼요.</p>
                  ) : r.contacts.length === 0 ? (
                    <p className="mt-1 text-caption text-faint">등록된 연락처 없음</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                      {r.contacts.map((c) => (
                        <span key={c.label}>
                          <span className="text-faint">{c.label}</span>{" "}
                          <span className="font-medium text-fg">{c.value}</span>
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
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
