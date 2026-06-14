import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getConversation } from "@/lib/chat";
import { getOrCreateConversation } from "@/lib/conversations";
import { BriefPanel } from "../chat/[conversationId]/BriefPanel";
import { InquiryForm } from "./InquiryForm";

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

  const next = buildInquiryPath(photographerId, photoId);
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (me.photographer?.id === photographerId) redirect("/studio");

  const supabase = await createClient();
  const conversationId = await getOrCreateConversation(photographerId, photoId);
  const briefRequiredAfter = new Date().toISOString();
  const [{ data: profile }, conversation] = await Promise.all([
    supabase
      .from("profiles")
      .select("phone, instagram_id, discord_id, contact_email")
      .eq("id", me.id)
      .maybeSingle(),
    getConversation(conversationId),
  ]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-lg flex-col justify-center px-4 py-10 font-kr sm:px-6">
      <Link href={`/photographers/${photographerId}`} className="mb-6 text-sm text-fg/50 hover:text-fg">
        ← 작가 프로필
      </Link>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted">{photographer.display_name || "작가"}에게 문의하기</p>
            <h1 className="mt-2 text-2xl font-semibold">연락 가능한 전화번호를 알려주세요</h1>
          </div>
          <BriefPanel
            conversationId={conversationId}
            amCustomer
            initialBrief={null}
            sourcePhotoPath={conversation?.source_photo_path ?? null}
            expandOnHover
            requireCompletion
          />
        </div>

        <InquiryForm
          photographerId={photographerId}
          photoId={photoId}
          initialPhone={(profile?.phone as string | null) ?? ""}
          initialInstagramId={(profile?.instagram_id as string | null) ?? ""}
          initialDiscordId={(profile?.discord_id as string | null) ?? ""}
          initialContactEmail={(profile?.contact_email as string | null) ?? ""}
          briefRequiredAfter={briefRequiredAfter}
        />
      </section>
    </main>
  );
}

function buildInquiryPath(photographerId: string, photoId: string) {
  const params = new URLSearchParams({ photographerId });
  if (photoId) params.set("photoId", photoId);
  return `/inquiry?${params.toString()}`;
}
