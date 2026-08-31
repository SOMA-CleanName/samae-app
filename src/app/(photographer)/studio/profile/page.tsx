import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AvatarUploader } from "@/app/(user)/settings/AvatarUploader";
import { ProfileForm } from "./ProfileForm";
import { ContactMethodsEditor } from "./ContactMethodsEditor";
import { updateContactMethods } from "../actions";
import { normalizeContactMethods } from "@/lib/photographer-contacts";

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
    .select("display_name, bio, regions, mood_tags, price_from_krw, contact_methods")
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
      <section className="mt-6 rounded-2xl border border-fg/10 bg-surface p-4">
        <p className="text-sm font-semibold text-fg">프로필 대표 사진</p>
        <div className="mt-4">
          <AvatarUploader
            initialUrl={me.avatarUrl}
            fallback={(me.photographer.displayName || me.displayName || me.email || "작가").slice(0, 1)}
          />
        </div>
      </section>
      <ProfileForm initial={initial} />

      {/* 고객에게 건넬 연락 수단 — 예약 확정 뒤 [연락처 보내기] 로 한 번에 넘긴다.
          채팅에 직접 적는 건 여전히 막혀 있다(추적이 끊기면 환불 판정 근거가 사라진다). */}
      <section className="mt-8 rounded-2xl border border-fg/10 bg-surface p-4">
        <p className="text-sm font-semibold text-fg">고객에게 보낼 연락처</p>
        <p className="mt-1 text-xs leading-relaxed text-fg/55">
          예약이 확정되면 채팅의 예약 카드에서 한 번에 보낼 수 있어요. 고객이 안내를 확인하고
          동의해야 전달됩니다. 채팅에 직접 적는 건 그전까지 막혀 있어요.
        </p>
        <form action={updateContactMethods} className="mt-4">
          <ContactMethodsEditor initial={normalizeContactMethods(data?.contact_methods)} />
        </form>
      </section>
    </main>
  );
}
