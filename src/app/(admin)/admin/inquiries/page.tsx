import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";

// 문의 관리 — 청크 4에서 구현 예정 (접수 목록·상태 처리)
export default function AdminInquiriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">문의 관리</h1>
      <EmptyState
        className="mt-6"
        icon={<ClipboardIcon className="h-7 w-7" />}
        title="곧 제공돼요"
        description="문의 접수 목록과 상태 처리를 준비 중이에요."
      />
    </main>
  );
}
