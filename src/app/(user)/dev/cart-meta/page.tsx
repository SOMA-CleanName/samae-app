import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/user/cart/AddToCartButton";
import { cartMetaLabels } from "@/lib/cart-detail-navigation";
import {
  groupCartMetaSamples,
  type CartMetaSample,
  type CartMetaSampleGroups,
  type CartMetaSampleView,
} from "@/lib/cart-meta-dev";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("ko-KR");
const PAGE_SIZE = 1000;

const sections: Array<{
  key: keyof CartMetaSampleGroups;
  title: string;
  description: string;
}> = [
  {
    key: "locationOnly",
    title: "장소만 있음",
    description: "가격 협의 + 실제 장소가 보여야 합니다.",
  },
  {
    key: "priceOnly",
    title: "가격만 있음",
    description: "실제 가격 + 장소 협의가 보여야 합니다.",
  },
  {
    key: "neither",
    title: "가격·장소 모두 없음",
    description: "가격, 장소 협의가 한 줄로 보여야 합니다.",
  },
];

async function loadPublishedPhotos(): Promise<CartMetaSample[]> {
  const admin = createAdminClient();
  const rows: CartMetaSample[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("photos")
      .select("id, src_url, thumb_url, width, height, price_krw, location_text, region")
      .eq("visibility", "published")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`로컬 메타 샘플 조회 실패: ${error.message}`);
    const page = (data ?? []) as CartMetaSample[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function SampleCard({ photo }: { photo: CartMetaSampleView }) {
  const priceText = photo.price_krw != null ? `₩${fmt.format(photo.price_krw)}` : null;
  const expected = cartMetaLabels(priceText, photo.location);
  const imageUrl = photo.thumb_url ?? photo.src_url;

  return (
    <article data-cart-card className="overflow-hidden rounded-3xl border border-line bg-bg shadow-sm">
      <Link href={`/photos/${photo.id}`} className="group block">
        <div className="relative aspect-[4/5] overflow-hidden bg-soft">
          <Image
            src={imageUrl}
            alt="빈 가격·장소 표시 확인용 사진"
            fill
            sizes="(max-width: 640px) 50vw, 280px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      </Link>

      <div className="space-y-3 p-4">
        <div className="space-y-1 text-body-sm">
          <p className="text-muted">실제 가격: {priceText ?? "없음"}</p>
          <p className="text-muted">실제 장소: {photo.location ?? "없음"}</p>
          <p className="font-bold text-fg">
            예상 표시: {expected.primaryText}
            {expected.locationText ? ` · ${expected.locationText}` : ""}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <Link href={`/photos/${photo.id}`} className="text-body-sm font-semibold text-fg underline-offset-4 hover:underline">
            원본 상세
          </Link>
          <div className="flex items-center gap-2 text-body-sm font-semibold text-fg">
            관심사진
            <AddToCartButton
              variant="row"
              item={{ id: photo.id, src: imageUrl, w: photo.width, h: photo.height }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function CartMetaDevPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const photos = await loadPublishedPhotos();
  const groups = groupCartMetaSamples(photos);

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-10 space-y-3">
        <p className="text-body-sm font-bold text-brand">LOCAL QA</p>
        <h1 className="text-3xl font-black tracking-tight text-fg">관심사진 가격·장소 협의 확인</h1>
        <p className="max-w-2xl text-body text-muted">
          사진의 + 버튼으로 관심사진에 담은 뒤 우측 하단 도크를 열어 실제 메타 패널을 확인하세요.
          이 페이지는 개발 환경에서만 열립니다.
        </p>
      </header>

      <div className="space-y-12">
        {sections.map((section) => {
          const samples = groups[section.key];
          return (
            <section key={section.key} className="space-y-4">
              <div>
                <h2 className="text-xl font-extrabold text-fg">
                  {section.title} <span className="text-brand">{samples.length}장</span>
                </h2>
                <p className="mt-1 text-body-sm text-muted">{section.description}</p>
              </div>

              {samples.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
                  {samples.map((photo) => (
                    <SampleCard key={photo.id} photo={photo} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line bg-soft px-5 py-8 text-center text-body-sm text-muted">
                  현재 공개 사진 중 이 조건에 맞는 샘플이 없습니다.
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
