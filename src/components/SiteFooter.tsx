import Link from "next/link";
import { businessInfoRows } from "@/lib/business-info";

/**
 * 지면 공통 푸터 — 운영 주체를 밝히는 자리.
 *
 * **데스크톱에서만 그린다.** 모바일은 하단 플로팅 내비가 화면 아래를 이미 쓰고 있고,
 * 피드가 무한 스크롤이라 푸터까지 닿지도 않는다. 반대로 결제채널 심사는 브라우저로
 * 사이트를 열어 하단의 사업자 정보를 확인하므로, 데스크톱에 있으면 요건은 충족된다.
 */
export function SiteFooter() {
  const rows = businessInfoRows();

  return (
    <footer className="hidden border-t border-line px-8 py-10 font-kr md:block">
      <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-8 gap-y-4">
        <Link
          href="/"
          className="font-display text-xl italic leading-none text-brand transition-opacity hover:opacity-80"
        >
          samae
        </Link>
        <nav aria-label="사매 안내" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/privacy" className="text-muted transition-colors hover:text-brand">
            개인정보 처리방침
          </Link>
        </nav>
      </div>

      {/*
        사업자 정보 — 결제채널 심사가 사이트의 상호·사업자번호를 채널 등록 정보와 대조한다.
        ⚠️ 지우지 말 것. 값은 lib/business-info 한 곳에서만 고친다.
      */}
      <div className="mx-auto mt-6 max-w-5xl border-t border-line pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">운영 주체</p>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] leading-relaxed text-muted">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-1.5">
              <dt className="text-faint">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
