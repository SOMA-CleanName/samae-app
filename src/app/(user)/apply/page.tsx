import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApplyLeadForm } from "./ApplyLeadForm";

export const metadata: Metadata = { title: "작가 신청" };
export const dynamic = "force-dynamic";

// 작가 신청 — 로그인 필수. 신청은 계정에 연결되고, 운영자 승인 시 작가로 등록된다.
export default async function ApplyPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/apply");
  if (me.photographer) redirect("/studio"); // 이미 작가(신청/승인 내역 있음)

  // 처리 전(new·contacted) 신청이 있으면 대기 화면
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("photographer_applications")
    .select("display_name, status, created_at")
    .eq("profile_id", me.id)
    .in("status", ["new", "contacted"])
    .maybeSingle();

  if (open) {
    return (
      <main className="mx-auto max-w-lg px-3.5 py-10 sm:px-5 font-kr">
        <h1 className="text-2xl font-semibold">작가 신청</h1>
        <div className="mt-6 rounded-2xl border border-warning/20 bg-warning-soft p-6">
          <p className="text-base font-semibold">승인 대기 중이에요</p>
          <p className="mt-1.5 text-sm text-fg/65">
            운영자 검토 후 안내드려요. 보통 영업일 기준 1~2일 소요됩니다.
          </p>
          <p className="mt-3 text-xs text-fg/45">신청 작가명: {open.display_name}</p>
        </div>
        <Link href="/" className="mt-6 inline-block text-sm text-fg/50 hover:text-fg">
          ← 탐색으로
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 sm:px-5 font-kr">
      <h1 className="text-2xl font-semibold">작가 신청</h1>
      <p className="mt-2 text-sm text-fg/60">
        아래 정보를 남기고 신청하면, 운영자 검토 후 작가로 등록돼 탐색 탭에 노출되고 의뢰를 받을 수 있어요.
      </p>
      <ApplyLeadForm kakaoChannelUrl={process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL ?? ""} />
    </main>
  );
}
