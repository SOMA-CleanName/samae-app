import { EmptyState } from "@/components/ui";
import { UserIcon } from "@/components/user/icons";

// 회원 관리 — 청크 3에서 구현 예정 (목록·검색·역할·정지)
export default function AdminUsersPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <h1 className="text-h1 font-semibold">회원 관리</h1>
      <EmptyState
        className="mt-6"
        icon={<UserIcon className="h-7 w-7" />}
        title="곧 제공돼요"
        description="회원 목록·검색·역할·정지 관리를 준비 중이에요."
      />
    </main>
  );
}
