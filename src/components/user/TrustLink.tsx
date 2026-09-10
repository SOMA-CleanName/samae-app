"use client";

import Link from "next/link";
import { mpTrack } from "@/lib/mixpanel";

/**
 * 신뢰·안전 지면으로 가는 한 줄.
 *
 * 돈을 보내거나 문의를 넣기 직전에 둔다. 그 순간이 "이거 믿어도 되나"가
 * 가장 크게 드는 자리이고, 그때 답이 화면 안에 없으면 사람은 창을 닫는다.
 *
 * 여기서 무엇을 약속하지는 않는다 — 문은 열어 두고, 실제 근거는 /trust 가 말한다.
 * (포괄적 보증 문구는 법률 검토 전까지 어디에도 쓰지 않는다)
 */
export function TrustLink({
  from,
  label = "사매가 어떻게 지키는지 보기",
  className,
}: {
  /** 어느 자리에서 눌렀는지 — 어느 지점에서 불안해하는지 보려고 남긴다 */
  from: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/trust"
      onClick={() => mpTrack("Open Trust Page", { from })}
      className={[
        "trust-link inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted",
        className ?? "",
      ].join(" ")}
    >
      <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-brand" />
      <span className="underline decoration-line-strong underline-offset-4">{label}</span>
      <span aria-hidden className="trust-link-arrow text-[10px]">
        →
      </span>
    </Link>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
