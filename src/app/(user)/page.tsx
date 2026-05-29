/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {
  fetchPublishedPhotos,
  fetchFilterOptions,
  searchPhotographers,
  type GalleryPhoto,
} from "@/lib/discovery";
import { PhotographerCardView } from "@/components/user/PhotographerCard";

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
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 font-kr">
        <p className="text-sm text-fg/55">
          “{sp.q}” 검색 결과 {results.length}명
        </p>
        {results.length === 0 ? (
          <p className="mt-10 text-center text-sm text-fg/45">
            일치하는 작가가 없어요. 다른 이름이나 지역으로 검색해보세요.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <PhotographerCardView key={p.handle} p={p} />
            ))}
          </div>
        )}
      </main>
    );
  }

  // 탐색 모드 (필터 + 갤러리)
  const [{ regions, moods }, photos] = await Promise.all([
    fetchFilterOptions(),
    fetchPublishedPhotos({ mood: sp.mood, region: sp.region }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">
        다양한 무드, 다양한 작가.
      </h1>
      <p className="mt-2 text-sm text-fg/55">
        마음에 드는 장면을 골라 그 작가를 만나보세요.
      </p>

      {/* 필터 칩 */}
      <div className="mt-5 flex flex-col gap-2">
        <ChipRow label="무드" items={moods} active={sp.mood} param="mood" other={sp.region} otherParam="region" />
        <ChipRow label="지역" items={regions} active={sp.region} param="region" other={sp.mood} otherParam="mood" />
      </div>

      {/* 갤러리 */}
      {photos.length === 0 ? (
        <p className="mt-12 text-center text-sm text-fg/45">
          조건에 맞는 사진이 아직 없어요.
        </p>
      ) : (
        <div className="mt-6 columns-2 sm:columns-3 lg:columns-4 gap-2 [&>*]:mb-2">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} />
          ))}
        </div>
      )}
    </main>
  );
}

// 필터 칩 한 줄 (선택 시 토글, 다른 파라미터 유지)
function ChipRow({
  label,
  items,
  active,
  param,
  other,
  otherParam,
}: {
  label: string;
  items: string[];
  active?: string;
  param: string;
  other?: string;
  otherParam: string;
}) {
  if (items.length === 0) return null;
  const hrefFor = (val?: string) => {
    const sp = new URLSearchParams();
    if (other) sp.set(otherParam, other);
    if (val) sp.set(param, val);
    const s = sp.toString();
    return s ? `/?${s}` : "/";
  };
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
      <span className="shrink-0 text-xs text-fg/40">{label}</span>
      <Chip href={hrefFor(undefined)} on={!active}>전체</Chip>
      {items.map((it) => (
        <Chip key={it} href={hrefFor(it)} on={active === it}>
          {param === "mood" ? `#${it}` : it}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-1 text-xs ${
        on ? "bg-fg text-bg" : "bg-fg/[0.06] text-fg/70 hover:bg-fg/10"
      }`}
    >
      {children}
    </Link>
  );
}

function PhotoCard({ photo }: { photo: GalleryPhoto }) {
  return (
    <Link
      href={`/photographers/${photo.photographer.handle}`}
      className="block break-inside-avoid overflow-hidden rounded-lg bg-fg/[0.05]"
    >
      <img
        src={photo.thumb_url ?? photo.src_url}
        alt=""
        loading="lazy"
        className="w-full object-cover transition-transform hover:scale-[1.02]"
      />
    </Link>
  );
}

