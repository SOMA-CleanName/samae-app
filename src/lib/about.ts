import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  ABOUT_SECTION_TYPES,
  sectionHasContent,
  type AboutSection,
  type AboutSectionType,
} from "@/lib/about-types";

// 타입·판별 로직은 클라이언트 공용 모듈(about-types)에 있고, 여기선 서버 조회만 담당
export * from "@/lib/about-types";

type RawSection = { id: string; type: string; content: unknown; sort_order: number };

function shape(rows: RawSection[]): AboutSection[] {
  return rows.filter(
    (r): r is RawSection & { type: AboutSectionType } =>
      (ABOUT_SECTION_TYPES as string[]).includes(r.type)
  ) as unknown as AboutSection[];
}

// 공개 프로필용 — 내용 있는 섹션만 (RLS: 승인 작가는 누구나 조회 가능)
export async function fetchPhotographerAboutSections(photographerId: string): Promise<AboutSection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("about_sections")
    .select("id, type, content, sort_order")
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: true });
  return shape((data ?? []) as RawSection[]).filter(sectionHasContent);
}

// 스튜디오 관리용 — 빈 섹션 포함 전체. 호출자가 소유 작가임을 보장.
export async function listMyAboutSections(photographerId: string): Promise<AboutSection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("about_sections")
    .select("id, type, content, sort_order")
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: true });
  return shape((data ?? []) as RawSection[]);
}
