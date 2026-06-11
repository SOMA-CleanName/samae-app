import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 보정본 전달 도메인 — 비공개 버킷(samae-delivery) + 만료형 서명 URL.
// 업로드는 service_role, 다운로드 게이트는 '참여자 검증'이 담당한다.

export const DELIVERY_BUCKET = "samae-delivery";
const SIGNED_TTL = 60 * 60; // 서명 URL 유효시간(초) — 1시간

export type Delivery = {
  booking_id: string;
  asset_paths: string[];
  external_link: string | null;
  expires_at: string | null;
};

export type DeliveryDownload = { name: string; url: string };
export type DeliveryAsset = { path: string; name: string };

// 스토리지 키({bookingId}/{uuid}__{표시명})에서 사람이 읽을 파일명만 뽑는다.
export function deliveryAssetName(path: string): string {
  const seg = path.split("/").pop() ?? "파일";
  const idx = seg.indexOf("__");
  return idx >= 0 ? seg.slice(idx + 2) : seg;
}

// 예약의 전달 레코드 (RLS: 참여자 조회)
export async function getDelivery(bookingId: string): Promise<Delivery | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deliveries")
    .select("booking_id, asset_paths, external_link, expires_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return (data as Delivery) ?? null;
}

// 보정본 다운로드용 서명 URL 목록.
// ⚠️ 호출자가 이 예약의 참여자임을 먼저 보장해야 한다(페이지가 getBooking RLS로 검증).
export async function getDeliveryDownloads(bookingId: string): Promise<DeliveryDownload[]> {
  const delivery = await getDelivery(bookingId);
  if (!delivery || delivery.asset_paths.length === 0) return [];

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(DELIVERY_BUCKET)
    .createSignedUrls(delivery.asset_paths, SIGNED_TTL);
  if (!data) return [];

  return data
    .filter((d) => d.signedUrl)
    .map((d) => ({
      name: deliveryAssetName(d.path ?? ""),
      url: d.signedUrl as string,
    }));
}
