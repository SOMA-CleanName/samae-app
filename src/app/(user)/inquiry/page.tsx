import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InquiryForm } from "./InquiryForm";
import { InquiryBackButton } from "./InquiryBackButton";

export default async function InquiryPage({
  searchParams,
}: {
  searchParams?: Promise<{ photographerId?: string; photoId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const photographerId = sp.photographerId ?? "";
  const photoId = sp.photoId ?? "";
  if (!photographerId) notFound();

  const [me, photographer] = await Promise.all([
    getCurrentUser(),
    fetchPhotographerById(photographerId),
  ]);
  if (!photographer) notFound();

  if (me?.photographer?.id === photographerId) redirect("/studio");

  let profile: {
    phone: string | null;
    instagram_id: string | null;
    discord_id: string | null;
    contact_email: string | null;
  } | null = null;

  if (me) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("phone, instagram_id, discord_id, contact_email")
      .eq("id", me.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-lg flex-col justify-center px-4 py-10 font-kr sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <InquiryBackButton fallbackHref={`/photographers/${photographerId}`} />
        <Link href={`/photographers/${photographerId}`} className="text-sm text-fg/50 hover:text-fg">
          작가 프로필
        </Link>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">{photographer.display_name || "작가"}에게 문의하기</p>
            <h1 className="mt-2 text-2xl font-semibold">예약 문의를 남겨주세요</h1>
          </div>
        </div>

        <InquiryForm
          photographerId={photographerId}
          photoId={photoId}
          initialPhone={(profile?.phone as string | null) ?? ""}
          initialInstagramId={(profile?.instagram_id as string | null) ?? ""}
          initialDiscordId={(profile?.discord_id as string | null) ?? ""}
          initialContactEmail={(profile?.contact_email as string | null) ?? ""}
        />
      </section>
    </main>
  );
}
