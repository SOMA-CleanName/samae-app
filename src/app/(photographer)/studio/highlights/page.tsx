import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyHighlights } from "@/lib/highlights";
import { fetchPhotographerPhotos } from "@/lib/discovery";
import { HighlightsManager, type PickPhoto } from "./HighlightsManager";

export const dynamic = "force-dynamic";

// 스튜디오 하이라이트 관리 — 대표 컬렉션 생성·편집·순서·삭제
export default async function StudioHighlightsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/highlights");
  if (!me.photographer) redirect("/studio");

  const [highlights, photos] = await Promise.all([
    listMyHighlights(me.photographer.id),
    fetchPhotographerPhotos(me.photographer.id),
  ]);
  const picker: PickPhoto[] = (photos as { id: string; src_url: string; thumb_url: string | null }[]).map(
    (p) => ({ id: p.id, src_url: p.src_url, thumb_url: p.thumb_url ?? p.src_url })
  );

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">하이라이트</h1>
      <p className="mt-1 text-sm text-fg/55">
        대표 컬렉션을 만들어 프로필 상단에 원형으로 보여줘요. 공개된 사진만 노출됩니다.
      </p>
      <HighlightsManager highlights={highlights} photos={picker} />
    </main>
  );
}
