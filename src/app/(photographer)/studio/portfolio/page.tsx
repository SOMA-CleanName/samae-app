/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PortfolioManager } from "./PortfolioManager";
import { PortfolioEditManager } from "./PortfolioEditManager";
import type { PackageOption } from "./PortfolioUploader";
import { EditTrigger } from "./EditTrigger";
import { DeletePostButton } from "./DeletePostButton";
import { WalletIcon, MapPinIcon } from "@/components/user/icons";
import { setAlbumVisibility } from "./actions";
import { PhotoSortGrid } from "./PhotoSortGrid";

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

  // 가격 선택지 — 작가 본인의 활성 패키지
  const { data: pkgData } = await supabase
    .from("packages")
    .select("id, name, price_krw")
    .eq("photographer_id", me.photographer.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const packages = (pkgData ?? []) as PackageOption[];

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
        <PortfolioManager packages={packages} />
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
      <PortfolioEditManager photos={photos} descriptions={Object.fromEntries(descById)} packages={packages} />
    </main>
  );
}

// 게시물(피드) 카드 — 헤더(그룹 정보·게시물 공개/삭제) + 사진 그리드(순서 변경)
function GroupCard({ g }: { g: Group }) {
  const count = g.photos.length;
  const allPublished = g.photos.every((p) => p.visibility === "published");
  const anyPublished = g.photos.some((p) => p.visibility === "published");
  const groupStatus = allPublished ? "공개" : anyPublished ? "일부 공개" : "비공개";
  // 가격·장소·태그는 피드 전체가 공유 — 대표(첫 장) 값으로 표시
  const rep = g.photos[0];

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
        {/* 우상단 액션 — 편집(항상) + 게시물 공개/삭제(앨범) */}
        <div className="ml-auto flex items-center gap-2">
          <EditTrigger photoId={rep.id} albumId={g.albumId} />
          {g.albumId && (
            <>
              <form action={setAlbumVisibility}>
                <input type="hidden" name="album_id" value={g.albumId} />
                <input type="hidden" name="visibility" value={allPublished ? "draft" : "published"} />
                <button className="rounded-full border border-fg/20 px-3 py-1 text-xs text-fg/70 hover:bg-fg/[0.04]">
                  {allPublished ? "게시물 비공개" : "게시물 공개"}
                </button>
              </form>
              <DeletePostButton albumId={g.albumId} count={count} />
            </>
          )}
        </div>
      </div>

      {/* 사진 그리드 — 드래그 정렬 + 대표 지정 */}
      <PhotoSortGrid albumId={g.albumId} photos={g.photos} />

      {/* 입력 정보 — 가격·장소·태그·설명 (피드 공유) */}
      <div className="mt-3 flex flex-col gap-2.5 border-t border-fg/10 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <WalletIcon className="h-4 w-4 text-fg/40" />
            {rep.price_krw != null ? (
              <span className="font-semibold text-fg">₩{fmt.format(rep.price_krw)}</span>
            ) : (
              <span className="text-fg/40">가격 미표시</span>
            )}
          </span>
          {rep.location_text && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-fg/70">
              <MapPinIcon className="h-4 w-4 shrink-0 text-fg/40" />
              <span className="truncate">{rep.location_text}</span>
            </span>
          )}
        </div>

        {rep.mood_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rep.mood_tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-xs font-medium text-fg/70"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {g.description && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/70">{g.description}</p>
        )}
      </div>
    </section>
  );
}

