/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PortfolioManager } from "./PortfolioManager";
import { PortfolioEditManager } from "./PortfolioEditManager";
import { EditTrigger } from "./EditTrigger";
import { DeletePostButton } from "./DeletePostButton";
import { setPhotoVisibility, setAlbumVisibility, reorderPhoto, deletePhoto } from "./actions";

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

// 같은 게시물(피드)로 묶은 그룹
type Group = { albumId: string | null; key: string; description: string | null; photos: Photo[] };

const fmt = new Intl.NumberFormat("ko-KR");

// 포트폴리오 관리 — 게시물(피드) 단위로 묶어 그룹 표시 + 순서 변경·게시물 공개/삭제
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

  // 피드 설명 (앨범 단위)
  const albumIds = [...new Set(photos.map((p) => p.album_id).filter(Boolean))] as string[];
  const descById = new Map<string, string | null>();
  if (albumIds.length > 0) {
    const { data: albums } = await supabase
      .from("albums")
      .select("id, description")
      .in("id", albumIds);
    for (const a of albums ?? []) descById.set(a.id as string, (a.description as string | null) ?? null);
  }

  // 등장 순서를 보존하며 album_id 로 묶기. 앨범 없는 사진은 각자 단일 그룹.
  const groups: Group[] = [];
  const byAlbum = new Map<string, Group>();
  for (const p of photos) {
    if (p.album_id) {
      let g = byAlbum.get(p.album_id);
      if (!g) {
        g = { albumId: p.album_id, key: p.album_id, description: descById.get(p.album_id) ?? null, photos: [] };
        byAlbum.set(p.album_id, g);
        groups.push(g);
      }
      g.photos.push(p);
    } else {
      groups.push({ albumId: null, key: p.id, description: null, photos: [p] });
    }
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
            게시물 단위로 묶여 있어요. 공개한 사진이 탐색에 노출됩니다. (공개 {publishedCount} / 전체 {photos.length}장)
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
        <div className="mt-7 flex flex-col gap-5">
          {groups.map((g) => (
            <GroupCard key={g.key} g={g} />
          ))}
        </div>
      )}

      {/* 편집 매니저 — 묶음(피드) 함께 수정 + 작업 토스트 (한 번만 마운트) */}
      <PortfolioEditManager photos={photos} descriptions={Object.fromEntries(descById)} />
    </main>
  );
}

// 게시물(피드) 카드 — 헤더(그룹 정보·게시물 공개/삭제) + 사진 그리드(순서 변경)
function GroupCard({ g }: { g: Group }) {
  const count = g.photos.length;
  const allPublished = g.photos.every((p) => p.visibility === "published");
  const anyPublished = g.photos.some((p) => p.visibility === "published");
  const groupStatus = allPublished ? "공개" : anyPublished ? "일부 공개" : "비공개";

  return (
    <section className="rounded-2xl border border-fg/10 p-3 sm:p-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <span className="text-sm font-medium">
          {g.albumId ? "📷 게시물" : "📷 단일 사진"}
          <span className="ml-1.5 text-xs font-normal text-fg/45">{count}장</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            allPublished
              ? "bg-emerald-500/15 text-emerald-700"
              : anyPublished
              ? "bg-amber-500/15 text-amber-700"
              : "bg-fg/10 text-fg/50"
          }`}
        >
          {groupStatus}
        </span>
        {g.description && (
          <span className="w-full truncate text-xs text-fg/55 sm:w-auto">“{g.description}”</span>
        )}

        {/* 게시물 단위 공개/삭제 (앨범 있는 경우) */}
        {g.albumId && (
          <div className="ml-auto flex items-center gap-2">
            <form action={setAlbumVisibility}>
              <input type="hidden" name="album_id" value={g.albumId} />
              <input type="hidden" name="visibility" value={allPublished ? "draft" : "published"} />
              <button className="rounded-full border border-fg/20 px-3 py-1 text-xs text-fg/70 hover:bg-fg/[0.04]">
                {allPublished ? "게시물 비공개" : "게시물 공개"}
              </button>
            </form>
            <DeletePostButton albumId={g.albumId} count={count} />
          </div>
        )}
      </div>

      {/* 사진 그리드 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {g.photos.map((p, i) => (
          <PhotoTile
            key={p.id}
            p={p}
            canUp={count > 1 && i > 0}
            canDown={count > 1 && i < count - 1}
          />
        ))}
      </div>
    </section>
  );
}

// 사진 타일 — 상태·가격(없으면 '가격 정보 없음')·순서이동·편집/공개/삭제
function PhotoTile({ p, canUp, canDown }: { p: Photo; canUp: boolean; canDown: boolean }) {
  return (
    <div className="group relative overflow-hidden rounded-lg bg-fg/[0.05]">
      <div className="aspect-square">
        <img
          src={p.thumb_url ?? p.src_url}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover ${p.visibility === "published" ? "" : "opacity-50"}`}
        />
      </div>

      {/* 상태 뱃지 */}
      <span
        className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] ${
          p.visibility === "published" ? "bg-emerald-500/90 text-white" : "bg-black/55 text-white"
        }`}
      >
        {p.visibility === "published" ? "공개" : "비공개"}
      </span>

      {/* 순서 이동 (피드에 여러 장일 때) */}
      {(canUp || canDown) && (
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          {canUp && (
            <form action={reorderPhoto}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="dir" value="up" />
              <button aria-label="앞으로" className="grid h-6 w-6 place-items-center rounded-full bg-black/55 text-xs text-white hover:bg-black/75">
                ←
              </button>
            </form>
          )}
          {canDown && (
            <form action={reorderPhoto}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="dir" value="down" />
              <button aria-label="뒤로" className="grid h-6 w-6 place-items-center rounded-full bg-black/55 text-xs text-white hover:bg-black/75">
                →
              </button>
            </form>
          )}
        </div>
      )}

      {/* 가격·장소 — 가격 없으면 '가격 정보 없음' */}
      <div className="absolute inset-x-1.5 top-9 flex flex-wrap gap-1">
        {p.price_krw != null ? (
          <span className="rounded-full bg-fg/85 px-2 py-0.5 text-[10px] text-bg">
            ₩{fmt.format(p.price_krw)}
          </span>
        ) : (
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white">
            가격 정보 없음
          </span>
        )}
        {p.location_text && (
          <span className="max-w-full truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white">
            📍 {p.location_text}
          </span>
        )}
      </div>

      {/* 액션 */}
      <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <EditTrigger photoId={p.id} albumId={p.album_id} />
        <form action={setPhotoVisibility} className="flex-1">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="visibility" value={p.visibility === "published" ? "draft" : "published"} />
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
