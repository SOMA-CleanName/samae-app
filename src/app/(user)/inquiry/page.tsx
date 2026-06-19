import { notFound, redirect } from "next/navigation";
import {
  fetchPhotoById,
  fetchPhotographerById,
  fetchPhotographerPhotos,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InquiryForm } from "./InquiryForm";
import { InquiryBackButton } from "./InquiryBackButton";
import { InquiryMediaPanel, type InquiryMediaItem } from "./InquiryMediaPanel";

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

  const mediaItems = await getInquiryMedia(photoId, photographerId);

  let profile: {
    phone: string | null;
    instagram_id: string | null;
    kakao_id: string | null;
    extra_contact: string | null;
  } | null = null;

  if (me) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("phone, instagram_id, kakao_id, extra_contact")
      .eq("id", me.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-5xl flex-col justify-center px-4 py-10 font-kr sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <InquiryBackButton fallbackHref={`/photographers/${photographerId}`} />
      </div>

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-line bg-surface shadow-sm md:h-[650px] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <InquiryMediaPanel
          items={mediaItems}
          name={photographer.display_name || "작가"}
        />

        <div className="min-h-0 px-5 pt-5 pb-9 sm:px-6 sm:pt-6 sm:pb-11 md:overflow-y-auto">
          <InquiryForm
            photographerId={photographerId}
            photoId={photoId}
            photographerName={photographer.display_name || "작가"}
            initialPhone={(profile?.phone as string | null) ?? ""}
            initialInstagramId={(profile?.instagram_id as string | null) ?? ""}
            initialKakaoId={(profile?.kakao_id as string | null) ?? ""}
            initialExtraContact={(profile?.extra_contact as string | null) ?? ""}
          />
        </div>
      </section>
    </main>
  );
}

async function getInquiryMedia(photoId: string, photographerId: string) {
  if (photoId) {
    const photo = await fetchPhotoById(photoId);
    if (photo) {
      return [{
        id: photo.id,
        src: photo.thumb_url ?? photo.src_url,
        label: "문의한 사진",
      }];
    }
  }

  const photos = await fetchPhotographerPhotos(photographerId);
  const representatives: InquiryMediaItem[] = [];
  const seen = new Set<string>();
  for (const photo of photos as {
    id: string;
    album_id: string | null;
    thumb_url: string | null;
    src_url: string;
  }[]) {
    const key = photo.album_id ?? `single:${photo.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    representatives.push({
      id: photo.id,
      src: photo.thumb_url ?? photo.src_url,
      label: "작가 대표 사진",
    });
  }
  return representatives;
}
