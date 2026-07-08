"use client";

// 제출 전 confirm 게이트가 붙은 폼 — 파괴적 개별 작업(카테고리 삭제 등)에 사용.
// server action 을 action prop 으로 받아 그대로 넘기고, 제출 시 확인창을 띄운다.
export function ConfirmForm({
  action,
  message,
  className,
  children,
}: {
  action: (fd: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
