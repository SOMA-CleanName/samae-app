import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ApplyForm } from "./ApplyForm";

// 작가 신청 페이지
export default async function ApplyPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/apply");
  // 이미 작가(신청 내역 있음)면 스튜디오로
  if (me.photographer) redirect("/studio");

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오로
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">작가 신청</h1>
      <p className="mt-2 text-sm text-fg/60">
        프로필을 등록하고 승인받으면 탐색 탭에 노출되고 의뢰를 받을 수 있어요.
      </p>
      <ApplyForm />
    </main>
  );
}
