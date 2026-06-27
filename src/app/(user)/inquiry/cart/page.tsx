import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { InquiryChat } from "../InquiryChat";

export const dynamic = "force-dynamic";

// 찜에서 여러 장 묶음 상담 — 선택한 photoIds 를 받아 사진을 보여주고,
// 채팅 위저드를 한 번 진행하면 작가별로 같은 내용이 전달됨(서버 dedup).
export default async function CartInquiryPage({
  searchParams,
}: {
  searchParams?: Promise<{ ids?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const ids = [
    ...new Set(
      String(sp.ids ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) notFound();

  const admin = createAdminClient();
  const { data } = await admin.from("photos").select("id, thumb_url, src_url").in("id", ids);
  const rows = (data ?? []) as { id: string; thumb_url: string | null; src_url: string }[];
  // 선택 순서 보존
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
  if (ordered.length === 0) notFound();

  const photoIds = ordered.map((p) => p.id);
  const photoSrcs = ordered.map((p) => p.thumb_url ?? p.src_url);

  return (
    <main className="bg-bg">
      <InquiryChat
        photographerId=""
        photoId=""
        photoSrc={null}
        photoIds={photoIds}
        photoSrcs={photoSrcs}
      />
    </main>
  );
}
