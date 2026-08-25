import { notFound, redirect } from "next/navigation";
import { fetchPhotoById, fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { InquiryBotChat } from "./InquiryBotChat";

export const dynamic = "force-dynamic";

// 채팅룸형 문의 (C1) — 기존 /inquiry 위저드와 병행 배포되는 챗봇 경로.
// 진입 쿼리는 위저드와 동일(photographerId, photoId) — 사진 상세의 문의 버튼을
// 플래그로 이 경로로 돌려 퍼널을 비교한다 (위저드 제거는 C3에서).
export default async function InquiryBotPage({
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

  const photo = photoId ? await fetchPhotoById(photoId) : null;
  const photoSrc = photo ? photo.thumb_url ?? photo.src_url : null;

  return (
    <main className="bg-bg">
      <InquiryBotChat
        photographerId={photographerId}
        photographerName={photographer.display_name}
        photographerAvatar={photographer.avatar_url}
        photoId={photoId}
        photoSrc={photoSrc}
        // LLM 봇 사진 컨텍스트 — 시스템 프롬프트에 무드·가격 주입
        photoMoodTags={photo?.mood_tags ?? []}
        photoPriceKrw={photo?.price_krw ?? null}
      />
    </main>
  );
}
