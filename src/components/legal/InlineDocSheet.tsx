"use client";

// 문서를 **지면 안에서** 읽게 한다. 새 탭으로 내보내지 않는다.
//
// 작가 입점 흐름(작가 신청 → 입점 동의)에서 약관 링크를 누르면 새 탭이 열리고,
// 그 탭에는 내비와 푸터가 있어서 거기서 홈·매거진으로 새어 나갔다. 신청서를 반쯤
// 채워 둔 원래 탭은 뒤에 남아 잊힌다 — 읽으러 갔다가 돌아오지 않는 것이다.
//
// 그래서 같은 화면 위에 덮개로 띄우고, 닫으면 **하던 자리 그대로** 돌아온다.
// 주소가 바뀌지 않으므로 입력 중이던 폼 값도 그대로 살아 있다.
//
// 본문은 `children` 으로 받는다 — 서버 컴포넌트에서 문서 본문을 그대로 넘길 수 있고,
// 이 파일이 문서 목록을 알 필요가 없다.

import { useEffect, useState, type ReactNode } from "react";

export function InlineDocSheet({
  label,
  title,
  version,
  children,
  className = "underline underline-offset-2 hover:text-fg",
}: {
  /** 링크로 보일 글자 */
  label: string;
  /** 덮개 상단 제목 */
  title: string;
  /** 있으면 제목 아래 버전 표시 */
  version?: string;
  /** 문서 본문 */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // 열려 있는 동안 뒤 지면이 스크롤되면 읽던 위치를 잃는다
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`cursor-pointer ${className}`}>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/50 font-kr"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => setOpen(false)}
        >
          {/* 바깥을 눌러도 닫히지만, 본문 안의 클릭은 전달하지 않는다 */}
          <div
            className="mt-auto flex max-h-[92svh] w-full flex-col rounded-t-2xl bg-bg sm:mx-auto sm:my-auto sm:max-w-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-fg">{title}</p>
                {version && <p className="mt-0.5 text-caption text-muted">버전 {version}</p>}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-body-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
