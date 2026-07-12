import { notFound } from "next/navigation";
import { fetchPhotoById } from "@/lib/discovery";
import { PhotoDetailView } from "./PhotoDetailView";
import type { Metadata } from "next";
import { photoMetadata } from "@/lib/seo";

// 사진 상세 — 전체 페이지. 직접 링크·새로고침·외부 유입(광고/스토리)·SEO 용.
// 홈 피드에서 클릭한 소프트 내비게이션은 @modal/(.)photos/[id] 가 모달로 가로챈다.
// 본문은 PhotoDetailView 로 모달과 공유 — CTA·공유·OG·추천 로직은 완전히 동일하다.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const photo = await fetchPhotoById(id);
  return photo ? photoMetadata(photo) : {};
}

export default async function PhotoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ like?: string; mock?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const photo = await fetchPhotoById(id);
  if (!photo) notFound();
  return <PhotoDetailView id={id} like={sp.like} mock={sp.mock} />;
}
