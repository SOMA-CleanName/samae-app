import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/user/icons";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/seo";
import { PUBLISHED_SPOTS } from "@/lib/spots-data";
import { countSpotPhotos } from "@/lib/spots";

// 촬영 장소 목록.
//
// "성수 스냅 어디서 찍지" 류 질의는 지금 블로그가 다 가져간다. 소개글만으로는 이길 수 없고,
// 그 장소에서 **실제로 찍힌 사진이 몇 장 있는지**가 우리가 내밀 수 있는 유일한 차별점이다.
// 그래서 목록에서부터 장수를 노출한다.
//
// 사진이 0장인 장소는 싣지 않는다. 들어가 봐야 볼 게 없는 페이지를 색인시키면
// 품질 점수만 깎인다(탐색 카테고리에서 이미 겪었다).
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "서울 스냅 촬영 장소",
  description:
    "을지로·경복궁·덕수궁 돌담길 등 서울 스냅 촬영 장소. 그곳에서 실제로 찍힌 사진과 찍는 작가, 대략의 비용까지 사매(samae)에서 확인하세요.",
  alternates: { canonical: "/spots" },
};

export default async function SpotsIndexPage() {
  const withCounts = await Promise.all(
    PUBLISHED_SPOTS.map(async (s) => ({ spot: s, count: await countSpotPhotos(s) }))
  );
  const spots = withCounts
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const list = itemListJsonLd(
    "서울 스냅 촬영 장소",
    spots.map((x) => ({ name: x.spot.name, path: `/spots/${x.spot.slug}` }))
  );
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: "촬영 장소", path: "/spots" },
  ]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      {list && <JsonLd data={list} />}
      <JsonLd data={breadcrumb} />

      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" /> 홈으로
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">서울 스냅 촬영 장소</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        장소 소개만 있는 글은 많아요. 여기엔 그 장소에서 실제로 찍힌 사진과, 그 사진을 찍은 작가가
        같이 있어요.
      </p>

      {spots.length === 0 ? (
        <p className="mt-10 text-sm text-muted">아직 공개된 장소가 없어요.</p>
      ) : (
        <ul className="mt-9 divide-y divide-line border-y border-line">
          {spots.map(({ spot, count }) => (
            <li key={spot.slug}>
              <Link href={`/spots/${spot.slug}`} className="group block py-5">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold tracking-tight transition-colors group-hover:text-muted">
                    {spot.name}
                  </h2>
                  <span className="text-xs text-muted">{spot.area}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
                    사진 {count}장
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-fg/85">{spot.desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        장소 정보는 확인된 것만 올려요. 확인 중인 곳은 준비되는 대로 추가됩니다.
      </p>
    </main>
  );
}
