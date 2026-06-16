import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ShieldIcon } from "@/components/user/icons";
import { AdminNav } from "./admin/AdminNav";

// 어드민 공통 셸 — 운영자 가드 + 상단 헤더/탭. 각 페이지는 자체 <main> 으로 컨테이너를 가진다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/"); // 운영자 아니면 차단

  return (
    <div className="min-h-[100svh] bg-bg font-kr">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-5">
          <ShieldIcon className="h-5 w-5 text-brand" />
          <span className="font-display text-lg italic text-brand">samae</span>
          <span className="text-title font-semibold">어드민</span>
          <Link
            href="/"
            className="ml-auto text-caption text-muted transition-colors hover:text-fg"
          >
            서비스로 →
          </Link>
        </div>
        <AdminNav />
      </header>
      {children}
    </div>
  );
}
