import { notFound, redirect } from "next/navigation";
import { fetchPhotoById } from "@/lib/discovery";

export const dynamic = "force-dynamic";

// 찜에서 단일 사진 상담 진입 — photoId만으로 작가를 찾아 채팅 상담으로 보냄.
// (찜 아이템엔 작가 id가 없어도 됨)
export default async function InquiryPhotoResolver({
  params,
}: {
  params: Promise<{ photoId: string }>;
}) {
  const { photoId } = await params;
  const photo = await fetchPhotoById(photoId);
  if (!photo) notFound();
  redirect(`/inquiry?photographerId=${photo.photographer_id}&photoId=${photoId}`);
}
