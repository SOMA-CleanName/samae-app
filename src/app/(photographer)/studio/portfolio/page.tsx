/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PortfolioUploader } from "./PortfolioUploader";
import { PhotoMetaEditor } from "./PhotoMetaEditor";
import { setPhotoVisibility, deletePhoto } from "./actions";

type Photo = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  visibility: string;
  price_krw: number | null;
  location_text: string | null;
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
    .select("id, thumb_url, src_url, visibility, price_krw, location_text, album_id")
    .eq("photographer_id", me.photographer.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const photos = (data ?? []) as Photo[];
  const publishedCount = photos.filter((p) => p.visibility === "published").length;

  // 피드(album_id)별 그룹 — 단독 사진은 자기 자신이 한 피드
  const feeds = new Map<string, Photo[]>();
  const feedOrder: string[] = [];
  for (const p of photos) {
    const key = p.album_id ?? `s-${p.id}`;
    const arr = feeds.get(key);
    if (arr) arr.push(p);
    else {
      feeds.set(key, [p]);
      feedOrder.push(key);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">포트폴리오</h1>
      <p className="mt-1 text-sm text-fg/55">
        같이 올린 사진은 하나의 피드가 돼요. 공개한 사진이 탐색에 낱개로 노출됩니다. (공개 {publishedCount}장 / 전체 {photos.length}장)
      </p>

      <div className="mt-6">
        <PortfolioUploader />
      </div>

      {photos.length === 0 ? (
        <p className="mt-8 text-center text-sm text-fg/45">아직 사진이 없어요.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-7">
          {feedOrder.map((key, i) => {
            const items = feeds.get(key)!;
            return (
              <section key={key}>
                <h2 className="text-xs font-semibold text-fg/45">
                  피드 {feedOrder.length - i} · {items.length}장
                </h2>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((p) => (
                    <PhotoTile key={p.id} p={p} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

// 사진 타일 — 상태 뱃지·가격/장소·편집/공개/삭제 액션
function PhotoTile({ p }: { p: Photo }) {
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
        <PhotoMetaEditor id={p.id} priceKrw={p.price_krw} locationText={p.location_text} />
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
