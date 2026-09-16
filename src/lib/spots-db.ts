import "server-only";

// 공개 데이터만 읽는다 → anon(public 클라이언트). /spots/[slug] 는 SSG 라 빌드 타임에
// 프리렌더되는데, admin(service_role)을 쓰면 그 키가 없는 Vercel Preview 스코프에서
// 빌드가 죽는다(spots.ts 에 같은 이유가 적혀 있다). RLS 가 published 를 대신 걸러 준다.
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 촬영 장소 — 운영자가 쓰고 켜는 장소 정보.
 *
 * 원래는 `src/lib/spots-data.ts` 에 366줄로 박혀 있었다. 0112 로 DB 로 옮겼다.
 *
 * ⚠️ `published` 는 **팩트체크가 끝난 곳만** true 다. 검증 안 된 정보를 웹에 올리면
 *    SEO 가 아니라 리스크다 — 장소 정보는 틀리면 사람을 헛걸음시킨다.
 *    파일 시절의 켜는 기준을 그대로 옮겨 적는다(어드민 화면에도 같은 문구를 둔다):
 *      ① 그 장소에서 실제로 찍힌 공개 사진이 9장 이상
 *      ② 공공장소일 것 — 캠퍼스·경기장·사유지는 촬영 허가 규정이 따로 있다
 *      ③ 주소·최인접 역은 출처로 확인한 것만 (`source` 에 남긴다)
 *    날짜가 박힌 정보는 쓰지 않는다 — 웹은 계속 남는다.
 */
export type Spot = {
  id: string;
  /** URL 조각. 영문만 — 한글 slug 는 인코딩 사고가 날 자리를 만든다. */
  slug: string;
  name: string;
  /** 광역 지자체. 한 지면 안에서 지역 섹션으로 나누는 데 쓴다. */
  city: string;
  /** 자치구 */
  area: string;
  address: string;
  /** 최인접 역·출구. 출처에 없으면 null — 지어내지 않는다. */
  station: string | null;
  desc: string;
  tip: string;
  /**
   * `photos.location_text` 매칭 키워드.
   * photos.region 은 전 건이 비어 있어(2026-08-31 확인) 쓸 수 없다.
   */
  keywords: string[];
  /** 무엇으로 검증했는지. 끄고 켤 때의 판단 근거. */
  source: string;
  published: boolean;
  sortOrder: number;
};

const COLS =
  "id, slug, name, city, area, address, station, descr, tip, keywords, source, published, sort_order";

type Row = {
  id: string;
  slug: string;
  name: string;
  city: string;
  area: string;
  address: string;
  station: string | null;
  descr: string;
  tip: string;
  keywords: string[] | null;
  source: string;
  published: boolean;
  sort_order: number;
};

// `desc` 는 SQL 예약어라 컬럼명이 `descr` 다. 코드 쪽 이름은 파일 시절 그대로 `desc` 를 쓴다
// — 소비처(지면 7곳)가 전부 그 이름을 쓰고 있어서 바꾸면 손댈 데가 늘어난다.
function toSpot(r: Row): Spot {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    area: r.area,
    address: r.address,
    station: r.station,
    desc: r.descr,
    tip: r.tip,
    keywords: r.keywords ?? [],
    source: r.source,
    published: r.published,
    sortOrder: r.sort_order,
  };
}

/** 공개된 장소 전부. 지역 → 정렬 순. */
export async function listPublishedSpots(): Promise<Spot[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("spots")
    .select(COLS)
    .eq("published", true)
    .order("city", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map(toSpot);
}

export async function findSpot(slug: string): Promise<Spot | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("spots")
    .select(COLS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return data ? toSpot(data as Row) : null;
}

/** 어드민 — 비공개까지 전부. */
export async function listAllSpots(): Promise<Spot[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("spots")
    .select(COLS)
    .order("city", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map(toSpot);
}
