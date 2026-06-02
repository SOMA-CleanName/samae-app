/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {
  fetchPublishedPhotos,
  fetchFilterOptions,
  searchPhotographers,
  type GalleryPhoto,
} from "@/lib/discovery";
import { PhotographerCardView } from "@/components/user/PhotographerCard";
import { MoreIcon } from "@/components/user/icons";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; mood?: string; region?: string };

export default async function ExploreHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  // 검색 모드
  if (sp.q) {
    const results = await searchPhotographers(sp.q);
    return (
      <section className="px-3 py-6 font-kr sm:px-5">
        <p className="text-sm text-fg/55">
          “{sp.q}” 검색 결과 {results.length}명
        </p>
        {results.length === 0 ? (
          <p className="mt-10 text-center text-sm text-fg/45">
            일치하는 작가가 없어요. 다른 이름이나 지역으로 검색해보세요.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((p) => (
              <PhotographerCardView key={p.handle} p={p} />
            ))}
          </div>
        )}
      </section>
    );
  }

  // 탐색 모드 (필터 + 갤러리)
  const [{ regions, moods }, photos] = await Promise.all([
    fetchFilterOptions(),
    fetchPublishedPhotos({ mood: sp.mood, region: sp.region }),
  ]);

  return (
    <section className="px-3 pb-10 font-kr sm:px-5">
      {/* 카테고리 탭 (무드) — 핀터레스트식 상단 탭 */}
      <TabRow items={moods} active={sp.mood} region={sp.region} />

      {/* 지역 보조 필터 */}
      {regions.length > 0 && (
        <div className="mt-1 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <RegionChip active={!sp.region} mood={sp.mood}>
            전체 지역
          </RegionChip>
          {regions.map((r) => (
            <RegionChip key={r} value={r} active={sp.region === r} mood={sp.mood}>
              📍 {r}
            </RegionChip>
          ))}
        </div>
      )}

      {/* 메이슨리 갤러리 */}
      {photos.length === 0 ? (
        <p className="mt-16 text-center text-sm text-fg/45">
          조건에 맞는 사진이 아직 없어요.
        </p>
      ) : (
        <div className="mt-4 columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7 [&>*]:mb-3">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} />
          ))}
        </div>
      )}
    </section>
  );
}

// 무드 카테고리 탭 — 선택 시 토글, 지역 파라미터 유지
function TabRow({
  items,
  active,
  region,
}: {
  items: string[];
  active?: string;
  region?: string;
}) {
  const hrefFor = (val?: string) => {
    const sp = new URLSearchParams();
    if (region) sp.set("region", region);
    if (val) sp.set("mood", val);
    const s = sp.toString();
    return s ? `/?${s}` : "/";
  };
  return (
    <div className="sticky top-[60px] z-20 -mx-3 flex items-center gap-1 overflow-x-auto bg-bg/85 px-3 py-2 backdrop-blur scrollbar-none sm:-mx-5 sm:px-5">
      <Tab href={hrefFor(undefined)} on={!active}>
        전체
      </Tab>
      {items.map((it) => (
        <Tab key={it} href={hrefFor(it)} on={active === it}>
          {it}
        </Tab>
      ))}
    </div>
  );
}

function Tab({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        on ? "bg-fg text-bg" : "text-fg/70 hover:bg-fg/[0.06]"
      }`}
    >
      {children}
    </Link>
  );
}

function RegionChip({
  value,
  active,
  mood,
  children,
}: {
  value?: string;
  active: boolean;
  mood?: string;
  children: React.ReactNode;
}) {
  const sp = new URLSearchParams();
  if (mood) sp.set("mood", mood);
  if (value) sp.set("region", value);
  const s = sp.toString();
  return (
    <Link
      href={s ? `/?${s}` : "/"}
      className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
        active ? "bg-fg/10 text-fg" : "bg-fg/[0.04] text-fg/55 hover:bg-fg/[0.08]"
      }`}
    >
      {children}
    </Link>
  );
}

// 핀터레스트식 핀 카드 — 라운드 타일 + 호버 시 작가명/더보기 오버레이
function PhotoCard({ photo }: { photo: GalleryPhoto }) {
  const name =
    photo.photographer.display_name || `@${photo.photographer.handle}`;
  return (
    <Link
      href={`/photographers/${photo.photographer.handle}`}
      className="group relative block break-inside-avoid overflow-hidden rounded-2xl bg-fg/[0.05]"
    >
      <img
        src={photo.thumb_url ?? photo.src_url}
        alt=""
        loading="lazy"
        className="w-full object-cover"
      />

      {/* 호버 오버레이 */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-black/0 p-2 opacity-0 transition-opacity group-hover:bg-black/15 group-hover:opacity-100">
        <div className="flex justify-end">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-fg shadow-sm">
            <MoreIcon />
          </span>
        </div>
        <span className="line-clamp-1 rounded-md bg-black/45 px-2 py-1 text-xs font-medium text-white">
          {name}
        </span>
      </div>
    </Link>
  );
}
