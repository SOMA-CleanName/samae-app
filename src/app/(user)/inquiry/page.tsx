import { notFound, redirect } from "next/navigation";
import { fetchPhotoById, fetchPhotographerById } from "@/lib/discovery";
import { getCurrentUser } from "@/lib/auth";
import { fetchPhotographerScript } from "@/lib/photographer-scripts-db";
import { InquiryChat } from "./InquiryChat";

export const dynamic = "force-dynamic";

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

  const [photo, script] = await Promise.all([
    photoId ? fetchPhotoById(photoId) : null,
    fetchPhotographerScript(photographerId),
  ]);
  const photoSrc = photo ? photo.thumb_url ?? photo.src_url : null;

  // 폼 질문 = 코어 4문항 + 작가 등록 커스텀 질문 — 봇이 묻는 것과 같은 시퀀스.
  // 대본은 문구만 주므로 자유 입력 질문(options 없음)으로 만든다.
  const customQuestions = script.customQuestions.map((question, i) => ({
    id: String(i + 1),
    question,
  }));

  return (
    <main className="bg-bg">
      <InquiryChat
        photographerId={photographerId}
        photoId={photoId}
        photoSrc={photoSrc}
        customQuestions={customQuestions}
        isLoggedIn={!!me}
      />
    </main>
  );
}
