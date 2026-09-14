import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { ApplyLeadForm } from "./ApplyLeadForm";
import { ApplyIntro } from "./ApplyIntro";

// canonical 없이 sitemap 에만 올라 있었다 → 루트의 canonical:"/" 를 상속해 홈의 복제본
export const metadata: Metadata = {
  title: "작가 신청",
  description:
    "사매에 사진을 올리고 촬영 의뢰를 받아보세요. 운영자 검토 후 작가로 등록되면 사진이 지면에 노출됩니다.",
  alternates: { canonical: "/apply" },
};
export const dynamic = "force-dynamic";

// 작가 신청 — **작가에게 뿌리는 주소**. 가입부터 신청까지 여기서 이어진다.
//
// 예전에는 로그인 게이트라 처음 온 사람은 로그인 화면만 봤고, 신청 버튼은 가입 뒤
// 프로필 메뉴를 뒤져야 나왔다. 링크 하나로 끝날 일이 세 단계였다.
// 이제 비로그인은 안내 지면을 보고, 가입/로그인 뒤 이 자리로 돌아와 바로 폼을 만난다.
//
// 신청 자체는 여전히 계정에 연결된다(profile_id) — 승인·알림·스튜디오가 전부 그걸 탄다.
export default async function ApplyPage() {
  const me = await getCurrentUser();
  if (!me) return <ApplyIntro />;
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
          <p className="mt-3 text-xs text-faint">신청 작가명: {open.display_name}</p>
        </div>
        <Link href="/" className="mt-6 inline-block text-sm text-muted hover:text-fg">
          ← 홈으로
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 sm:px-5 font-kr">
      {/* 작가 지원 폼 진입 — 공급측 온보딩 퍼널 시작(제출=Apply Photographer) */}
      <MpTrackOnce event="Start Apply Photographer" />
      <h1 className="text-2xl font-semibold">작가 신청</h1>
      <p className="mt-2 text-sm text-fg/60">
        아래 정보를 남기고 신청하면, 운영자 검토 후 작가로 등록돼 사진이 지면에 노출되고 의뢰를 받을 수 있어요.
      </p>
      <ApplyLeadForm kakaoChannelUrl={process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL ?? ""} />
    </main>
  );
}
