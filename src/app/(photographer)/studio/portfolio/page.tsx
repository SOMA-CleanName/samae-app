/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PortfolioUploader } from "./PortfolioUploader";
import { setPhotoVisibility, deletePhoto } from "./actions";

type Photo = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  visibility: string;
};

// 포트폴리오 관리 — 업로드 + 공개/비공개 + 삭제
export default async function PortfolioPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/portfolio");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, thumb_url, src_url, visibility")
    .eq("photographer_id", me.photographer.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const photos = (data ?? []) as Photo[];
  const publishedCount = photos.filter((p) => p.visibility === "published").length;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">포트폴리오</h1>
      <p className="mt-1 text-sm text-fg/55">
        공개한 사진이 탐색 갤러리에 노출됩니다. (현재 공개 {publishedCount}장 / 전체 {photos.length}장)
      </p>

      <div className="mt-6">
        <PortfolioUploader />
      </div>

      {photos.length === 0 ? (
        <p className="mt-8 text-center text-sm text-fg/45">아직 사진이 없어요.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-lg bg-fg/[0.05]">
              <div className="aspect-square">
                <img
                  src={p.thumb_url ?? p.src_url}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full object-cover ${
                    p.visibility === "published" ? "" : "opacity-50"
                  }`}
                />
              </div>

              {/* 상태 뱃지 */}
              <span
                className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] ${
                  p.visibility === "published"
                    ? "bg-emerald-500/90 text-white"
                    : "bg-black/55 text-white"
                }`}
              >
                {p.visibility === "published" ? "공개" : "비공개"}
              </span>

              {/* 액션 */}
              <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <form action={setPhotoVisibility} className="flex-1">
                  <input type="hidden" name="id" value={p.id} />
                  <input
                    type="hidden"
                    name="visibility"
                    value={p.visibility === "published" ? "draft" : "published"}
                  />
                  <button className="w-full rounded bg-white/90 py-1 text-[11px] font-medium text-fg hover:bg-white">
                    {p.visibility === "published" ? "비공개로" : "공개하기"}
                  </button>
                </form>
                <form action={deletePhoto}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded bg-brand/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand">
                    삭제
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
