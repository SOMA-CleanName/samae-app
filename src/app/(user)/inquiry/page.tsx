import Link from "next/link";
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

  const media = await getInquiryMedia(photoId, photographerId);

  let profile: {
    phone: string | null;
    instagram_id: string | null;
  } | null = null;

  if (me) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("phone, instagram_id")
      .eq("id", me.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-5xl flex-col justify-center px-4 py-10 font-kr sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <InquiryBackButton fallbackHref={`/photographers/${photographerId}`} />
      </div>

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-line bg-surface shadow-sm md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <InquiryMediaPanel
          src={media.src}
          label={media.label}
          fallbackName={photographer.display_name || "작가"}
        />

        <div className="px-5 pt-5 pb-9 sm:px-6 sm:pt-6 sm:pb-11">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted">{photographer.display_name || "작가"} 작가님께 문의하기</p>
                <Link
                  href={`/photographers/${photographerId}`}
                  className="text-xs text-fg/50 transition-all hover:font-semibold hover:text-fg"
                >
                  &gt; 작가 프로필 방문하기
                </Link>
              </div>
            </div>
          </div>

          <InquiryForm
            photographerId={photographerId}
            photoId={photoId}
            initialPhone={(profile?.phone as string | null) ?? ""}
            initialInstagramId={(profile?.instagram_id as string | null) ?? ""}
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
      return {
        src: photo.thumb_url ?? photo.src_url,
        label: "문의한 사진",
      };
    }
  }

  const photos = await fetchPhotographerPhotos(photographerId);
  const cover = photos[0] as { thumb_url?: string | null; src_url?: string | null } | undefined;
  return {
    src: cover?.thumb_url ?? cover?.src_url ?? null,
    label: "작가 프로필",
  };
}

function InquiryMediaPanel({
  src,
  label,
  fallbackName,
}: {
  src: string | null;
  label: string;
  fallbackName: string;
}) {
  return (
    <div className="relative min-h-80 bg-fg/[0.04] md:min-h-full">
      {src ? (
        <img src={src} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-fg/[0.04]">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-bg text-3xl font-semibold text-fg/45 shadow-sm">
            {fallbackName.slice(0, 1)}
          </div>
        </div>
      )}
    </div>
  );
}
