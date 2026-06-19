import { notFound, redirect } from "next/navigation";
import {
  fetchPhotoById,
  fetchPhotographerById,
  fetchPhotographerPhotos,
} from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui";
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
          src={media.src}
          label={media.label}
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
  name,
}: {
  src: string | null;
  label: string;
  name: string;
}) {
  return (
    <div className="relative min-h-80 bg-fg/[0.04] md:min-h-full">
      {src ? (
        // 모바일: 고정 높이 박스라 잘리지 않게 전체 사진 표시(contain) · 데스크톱: 긴 사이드 패널 채우기(cover)
        <img src={src} alt={label} className="absolute inset-0 h-full w-full object-contain md:object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-fg/[0.04]">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-bg text-3xl font-semibold text-fg/45 shadow-sm">
            {name.slice(0, 1)}
          </div>
        </div>
      )}

      {/* 작가 정보 — 사진 오른쪽 하단 오버레이 */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 backdrop-blur-sm">
        <Avatar name={name} size="sm" className="ring-1 ring-white/50" />
        <span className="text-caption font-semibold text-white">{name}</span>
      </div>
    </div>
  );
}
