import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findById } from "@/lib/persona/store";
import { fetchLikedPhotosByIds } from "@/lib/discovery";
import PersonaResult from "../../PersonaResult";
import type { PersonaSuccess } from "../../view-types";

// 공유 링크로 들어온 결과 화면.
// 바이럴 루프의 착지점 — 친구가 링크를 타고 와서 결과를 보고 "나도 해보기" 로 넘어간다.
// (분석 없이 저장된 결과만 되살리므로 Apify·LLM 비용이 들지 않는다)

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const stored = await findById(id);
  if (!stored) return { title: "촬영 페르소나 · samae" };

  const label = stored.shoot.shootPersonaLabel;
  const cardParams = new URLSearchParams({
    label,
    palette: stored.shoot.colorPalette.slice(0, 5).join(","),
  });
  // 저장된 추천 사진 상위 3장을 OG 카드에도 싣는다 — 링크 미리보기에서 사진이 보여야 눌린다
  const rows = await fetchLikedPhotosByIds(stored.photoIds.slice(0, 3));
  for (const p of rows.slice(0, 3)) cardParams.append("p", p.thumb_url ?? p.src_url);
  const card = `/event/persona/share?${cardParams.toString()}`;

  return {
    title: `${label} · 촬영 페르소나`,
    description: "피드 속에 숨어 있던 당신의 촬영 무드를 찾아드려요.",
    openGraph: {
      title: `${label} · 촬영 페르소나`,
      description: "당신의 피드가 말해주는 촬영 무드.",
      images: [{ url: card, width: 1080, height: 1920 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SharedPersonaPage({ params }: Params) {
  const { id } = await params;
  const stored = await findById(id);
  if (!stored) notFound();

  // 저장해 둔 사진 id 로 같은 추천을 복원 (비공개 전환된 사진은 자연히 빠진다)
  const rows = await fetchLikedPhotosByIds(stored.photoIds);
  const photos = rows.map((p) => ({ id: p.id, url: p.thumb_url ?? p.src_url }));

  const result: PersonaSuccess = {
    ok: true,
    username: "",
    profilePicUrl: null,
    persona: stored.persona,
    shoot: stored.shoot,
    photos,
    shareId: stored.id,
  };

  return <PersonaResult result={result} shared />;
}
