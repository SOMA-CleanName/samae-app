import { fetchActiveBanners, safeBannerHref } from "@/lib/banners";
import { BannerCarousel, type BannerItem } from "./BannerCarousel";

// 홈·카테고리 상단 배너 슬롯 — 서버에서 공개 배너를 읽어 캐러셀에 넘긴다.
// 배너가 없으면 아무것도 렌더하지 않아 레이아웃이 그대로다.
export async function HomeBannerSlot() {
  const banners = await fetchActiveBanners();
  if (banners.length === 0) return null;

  const items: BannerItem[] = banners.map((b) => ({
    id: b.id,
    src: b.image_url,
    alt: b.title || "배너",
    href: safeBannerHref(b.link_url),
  }));

  return <BannerCarousel items={items} />;
}
