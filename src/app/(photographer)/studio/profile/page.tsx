import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";

export type ProfileInitial = {
  displayName: string;
  bio: string;
  regions: string;
  moodTags: string;
  priceFrom: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

// 작가 프로필 편집
export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/profile");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("display_name, bio, regions, mood_tags, price_from_krw")
    .eq("id", me.photographer.id)
    .single();

  // 촬영비 수취 계좌 (payout_accounts — 소유자만 RLS 조회)
  const { data: acct } = await supabase
    .from("payout_accounts")
    .select("bank, number, holder")
    .eq("photographer_id", me.photographer.id)
    .maybeSingle();

  const initial: ProfileInitial = {
    displayName: data?.display_name ?? "",
    bio: data?.bio ?? "",
    regions: (data?.regions ?? []).join(", "),
    moodTags: (data?.mood_tags ?? []).join(", "),
    priceFrom: data?.price_from_krw ?? 0,
    bankName: acct?.bank ?? "",
    accountNumber: acct?.number ?? "",
    accountHolder: acct?.holder ?? "",
  };

  return (
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">프로필 편집</h1>
      <p className="mt-1 text-sm text-fg/55">{me.photographer.displayName}</p>
      <ProfileForm initial={initial} />
    </main>
  );
}
