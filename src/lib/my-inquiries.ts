// 비로그인 사용자의 '내 문의' — 문의 id 를 쿠키에 보관하고, 그 id 로 DB 에서 내역을 조회한다.
// (로그인이 없으므로 쿠키가 소유 증명. httpOnly 로 서버에서만 읽고, 상세는 서비스롤로 조회.)
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MyInquiry } from "@/lib/my-inquiries-view";

const COOKIE = "samae_inq";
const MAX = 80; // 쿠키 4KB 한계 여유 (UUID 80개 ≈ 3KB)
const ONE_YEAR = 60 * 60 * 24 * 365;

// 쿠키에 저장된 문의 id 목록(최신 앞).
export async function readMyInquiryIds(): Promise<string[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// 새 문의 id 들을 쿠키에 병합(최신 앞, 중복 제거, 상한). 서버액션/라우트에서만 호출(쿠키 쓰기).
export async function rememberInquiryIds(ids: string[]): Promise<void> {
  const fresh = ids.filter(Boolean);
  if (fresh.length === 0) return;
  const jar = await cookies();
  let existing: string[] = [];
  try {
    const raw = jar.get(COOKIE)?.value;
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) existing = arr.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* 무시 */
  }
  const merged = [...fresh, ...existing.filter((id) => !fresh.includes(id))].slice(0, MAX);
  jar.set(COOKIE, JSON.stringify(merged), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

type InquiryRow = {
  id: string;
  photographer_id: string;
  source_photo_id: string | null;
  phone: string | null;
  instagram_id: string | null;
  discord_id: string | null; // 카카오 아이디 재사용 컬럼
  extra_contact: string | null;
  party_size: number | null;
  purpose: string;
  preferred_date: string;
  region: string;
  note: string | null;
  ref_image_paths: string[] | null;
  status: string;
  created_at: string;
};

// 쿠키의 id 들로 문의 내역 조회(최신순) — 작가 아바타 + 문의한 사진 썸네일 포함.
export async function fetchMyInquiries(ids: string[]): Promise<MyInquiry[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("inquiries")
    .select(
      "id, photographer_id, source_photo_id, phone, instagram_id, discord_id, extra_contact, party_size, purpose, preferred_date, region, note, ref_image_paths, status, created_at"
    )
    .in("id", ids)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as InquiryRow[];
  if (rows.length === 0) return [];

  const phIds = [...new Set(rows.map((r) => r.photographer_id).filter(Boolean))];
  const photoIds = [...new Set(rows.map((r) => r.source_photo_id).filter(Boolean))] as string[];

  const [{ data: phs }, { data: photos }] = await Promise.all([
    admin.from("photographers").select("id, profile_id").in("id", phIds),
    admin.from("photos").select("id, thumb_url, src_url").in("id", photoIds.length ? photoIds : ["-"]),
  ]);
  const phRows = (phs ?? []) as { id: string; profile_id: string | null }[];
  const photoRows = (photos ?? []) as { id: string; thumb_url: string | null; src_url: string }[];

  const profileIds = [...new Set(phRows.map((p) => p.profile_id).filter(Boolean))] as string[];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, avatar_url")
    .in("id", profileIds.length ? profileIds : ["-"]);
  const avatarByProfile = new Map(
    ((profiles ?? []) as { id: string; avatar_url: string | null }[]).map((p) => [p.id, p.avatar_url])
  );
  const avatarByPh = new Map(phRows.map((p) => [p.id, p.profile_id ? avatarByProfile.get(p.profile_id) ?? null : null]));
  const thumbByPhoto = new Map(photoRows.map((p) => [p.id, p.thumb_url ?? p.src_url]));

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    photographerAvatar: avatarByPh.get(r.photographer_id) ?? null,
    photoThumb: r.source_photo_id ? thumbByPhoto.get(r.source_photo_id) ?? null : null,
    phone: r.phone,
    instagram: r.instagram_id,
    kakao: r.discord_id,
    extraContact: r.extra_contact,
    partySize: r.party_size,
    purpose: r.purpose,
    preferredDate: r.preferred_date,
    region: r.region,
    note: r.note,
    refImages: r.ref_image_paths ?? [],
  }));
}
