/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PortfolioManager } from "./PortfolioManager";
import { PortfolioEditManager } from "./PortfolioEditManager";
import { EditTrigger } from "./EditTrigger";
import { setPhotoVisibility, deletePhoto } from "./actions";

type Photo = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  visibility: string;
  price_krw: number | null;
  location_text: string | null;
  mood_tags: string[];
  album_id: string | null;
};

const fmt = new Intl.NumberFormat("ko-KR");

// 포트폴리오 관리 — 피드(묶음)별 그룹 + 사진별 공개/비공개·편집·삭제
export default async function PortfolioPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/portfolio");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, thumb_url, src_url, visibility, price_krw, location_text, mood_tags, album_id")
    .eq("photographer_id", me.photographer.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const photos = (data ?? []) as Photo[];
  const publishedCount = photos.filter((p) => p.visibility === "published").length;

  // 같은 피드(album_id)에 2장 이상이면 묶음 표시용으로 크기 집계
  const feedSize = new Map<string, number>();
  for (const p of photos) {
    if (!p.album_id) continue;
    feedSize.set(p.album_id, (feedSize.get(p.album_id) ?? 0) + 1);
  }

  // 피드 설명 (앨범 단위) — 편집기 프리필용
  const albumIds = [...new Set(photos.map((p) => p.album_id).filter(Boolean))] as string[];
  const descById = new Map<string, string | null>();
  if (albumIds.length > 0) {
    const { data: albums } = await supabase
      .from("albums")
      .select("id, description")
      .in("id", albumIds);
    for (const a of albums ?? []) descById.set(a.id as string, (a.description as string | null) ?? null);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">포트폴리오</h1>
          <p className="mt-1 text-sm text-fg/55">
            공개한 사진이 탐색에 노출돼요. (공개 {publishedCount} / 전체 {photos.length}장)
          </p>
        </div>
        <PortfolioManager />
      </div>

      {photos.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-fg/20 py-16 text-center">
          <p className="text-sm text-fg/55">아직 사진이 없어요.</p>
          <p className="mt-1 text-xs text-fg/40">‘+ 추가’를 눌러 첫 사진을 올려보세요.</p>
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <PhotoTile
              key={p.id}
              p={p}
              feedCount={p.album_id ? feedSize.get(p.album_id) ?? 1 : 1}
            />
          ))}
        </div>
      )}

      {/* 편집 매니저 — 묶음(피드) 함께 수정 + 작업 토스트 (한 번만 마운트) */}
      <PortfolioEditManager photos={photos} descriptions={Object.fromEntries(descById)} />
    </main>
  );
}

// 사진 타일 — 상태 뱃지·가격/장소·편집/공개/삭제 액션
function PhotoTile({ p, feedCount = 1 }: { p: Photo; feedCount?: number }) {
  return (
    <div className="group relative overflow-hidden rounded-lg bg-fg/[0.05]">
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

      {/* 묶음(피드) 표시 — 같은 게시물에 여러 장일 때 */}
      {feedCount > 1 && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
          ⧉ {feedCount}
        </span>
      )}

      {/* 가격·장소 표시 (설정된 경우) */}
      {(p.price_krw != null || p.location_text) && (
        <div className="absolute inset-x-1.5 top-7 flex flex-wrap gap-1">
          {p.price_krw != null && (
            <span className="rounded-full bg-fg/85 px-2 py-0.5 text-[10px] text-bg">
              ₩{fmt.format(p.price_krw)}
            </span>
          )}
          {p.location_text && (
            <span className="max-w-full truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white">
              📍 {p.location_text}
            </span>
          )}
        </div>
      )}

      {/* 액션 */}
      <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <EditTrigger photoId={p.id} albumId={p.album_id} />
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
  );
}
