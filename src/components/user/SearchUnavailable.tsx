"use client";

import { Button } from "@/components/ui/Button";
import { clearSearchSession } from "@/lib/search-navigation";

/** 사진 영역에 표시하는 지연·실패 상태. 검색어는 유지하고 새 요청으로 재시도한다. */
export function SearchUnavailable({ query }: { query: string }) {
  return (
    <div className="mx-auto flex min-h-[68svh] max-w-screen-2xl items-center justify-center px-4 pb-12 pt-8">
      <div className="flex flex-col items-center text-center">
        <div role="status" aria-live="polite" className="flex flex-col items-center">
          <svg aria-hidden="true" viewBox="0 0 72 72" fill="none" className="mb-6 h-16 w-16 text-faint/65">
            <rect x="8" y="6" width="45" height="44" rx="4" stroke="currentColor" strokeWidth="3" />
            <circle cx="40" cy="19" r="4.5" fill="currentColor" />
            <path d="m9 44 13-16 13 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="51" cy="51" r="17" fill="var(--bg)" stroke="currentColor" strokeWidth="3" />
            <path d="M51 42v10h7" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="text-[19px] font-bold leading-snug tracking-tight text-fg sm:text-h2">
            대기시간이 오래 걸립니다.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">잠시 후 다시 시도해주세요.</p>
        </div>
        {/* 같은 URL의 router.push는 요청을 생략할 수 있어 일반 GET 폼으로 다시 연다. */}
        <form action="/" method="get" className="mt-6" onSubmit={() => {
          try { clearSearchSession(window.sessionStorage, query); } catch { /* 저장소 접근 차단 */ }
        }}>
          <input type="hidden" name="q" value={query} />
          <Button
            type="submit"
            variant="brand"
            className="min-h-12 min-w-[148px]"
            leftIcon={
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7v5h-5M4 17v-5h5" />
                <path d="M6.2 7a7 7 0 0 1 11.5-1L20 9M4 15l2.3 3A7 7 0 0 0 17.8 17" />
              </svg>
            }
          >
            다시 시도
          </Button>
        </form>
      </div>
    </div>
  );
}
