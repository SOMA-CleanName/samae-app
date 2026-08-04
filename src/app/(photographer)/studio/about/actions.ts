"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ABOUT_SECTION_TYPES,
  type AboutImage,
  type AboutColumn,
  type AboutSectionContent,
  type AboutSectionType,
  type AboutTextStyle,
} from "@/lib/about";

// 섹션 CRUD — 쓰기 권한은 RLS(is_my_photographer)가 최종 방어, 여기선 작가 여부만 가드.
async function requirePhotographer() {
  const me = await getCurrentUser();
  if (!me?.photographer) throw new Error("작가만 사용할 수 있습니다.");
  return me.photographer.id;
}

function revalidate(photographerId: string) {
  revalidatePath("/studio/about");
  revalidatePath(`/photographers/${photographerId}`);
}

// ── content 정제 — 클라이언트 입력을 타입별 스키마로 강제 (초과 텍스트 절단·미지 필드 제거)
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function image(v: unknown): AboutImage | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || !o.url) return null;
  return {
    url: o.url.slice(0, 500),
    thumbUrl: typeof o.thumbUrl === "string" ? o.thumbUrl.slice(0, 500) : null,
    width: typeof o.width === "number" ? o.width : null,
    height: typeof o.height === "number" ? o.height : null,
  };
}

function column(v: unknown): AboutColumn {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    kind: o.kind === "quote" ? "quote" : "text",
    text: text(o.text, 2000),
    style: textStyle(o.style),
  };
}

const STYLE_SIZES = ["sm", "md", "lg"] as const;
const STYLE_COLORS = ["ink", "soft", "faint", "brand"] as const;
const STYLE_ALIGNS = ["left", "center", "right"] as const;

function textStyle(v: unknown): AboutTextStyle | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: AboutTextStyle = {};
  if (STYLE_SIZES.includes(o.size as (typeof STYLE_SIZES)[number])) {
    out.size = o.size as AboutTextStyle["size"];
  }
  if (STYLE_COLORS.includes(o.color as (typeof STYLE_COLORS)[number])) {
    out.color = o.color as AboutTextStyle["color"];
  }
  if (typeof o.bold === "boolean") out.bold = o.bold;
  if (STYLE_ALIGNS.includes(o.align as (typeof STYLE_ALIGNS)[number])) {
    out.align = o.align as AboutTextStyle["align"];
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeContent(type: AboutSectionType, raw: unknown): AboutSectionContent[AboutSectionType] {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (type) {
    case "heading":
      return { text: text(o.text, 200), style: textStyle(o.style) };
    case "text":
      return { text: text(o.text, 2000), style: textStyle(o.style) };
    case "text_columns":
      return { left: column(o.left), right: column(o.right) };
    case "quote":
      return { text: text(o.text, 500), style: textStyle(o.style) };
    case "image_full":
      return { image: image(o.image), caption: text(o.caption, 200) };
    case "image_pair": {
      const arr = Array.isArray(o.images) ? o.images : [];
      return { images: [image(arr[0]), image(arr[1])] };
    }
    case "image_text":
      return {
        image: image(o.image),
        text: text(o.text, 2000),
        imageSide: o.imageSide === "right" ? "right" : "left",
        style: textStyle(o.style),
      };
  }
}

const DEFAULT_CONTENT: { [T in AboutSectionType]: AboutSectionContent[T] } = {
  heading: { text: "" },
  text: { text: "" },
  text_columns: {
    left: { kind: "text", text: "" },
    right: { kind: "quote", text: "" },
  },
  quote: { text: "" },
  image_full: { image: null, caption: "" },
  image_pair: { images: [null, null] },
  image_text: { image: null, text: "", imageSide: "left" },
};

export async function createSection(type: AboutSectionType): Promise<{ id: string }> {
  if (!ABOUT_SECTION_TYPES.includes(type)) throw new Error("알 수 없는 섹션 타입입니다.");
  const photographerId = await requirePhotographer();
  const supabase = await createClient();

  // 맨 뒤에 추가
  const { data: last } = await supabase
    .from("about_sections")
    .select("sort_order")
    .eq("photographer_id", photographerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("about_sections")
    .insert({
      photographer_id: photographerId,
      type,
      content: DEFAULT_CONTENT[type],
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidate(photographerId);
  return { id: data.id as string };
}

export async function updateSection(id: string, type: AboutSectionType, content: unknown) {
  if (!ABOUT_SECTION_TYPES.includes(type)) throw new Error("알 수 없는 섹션 타입입니다.");
  const photographerId = await requirePhotographer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("about_sections")
    .update({ content: sanitizeContent(type, content) })
    .eq("id", id)
    .eq("photographer_id", photographerId);
  if (error) throw new Error(error.message);
  revalidate(photographerId);
}

export async function deleteSection(id: string) {
  const photographerId = await requirePhotographer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("about_sections")
    .delete()
    .eq("id", id)
    .eq("photographer_id", photographerId);
  if (error) throw new Error(error.message);
  revalidate(photographerId);
}

export async function reorderSections(ids: string[]) {
  const photographerId = await requirePhotographer();
  const supabase = await createClient();
  // 섹션 수가 많지 않아(수 개~수십 개) 순차 update 로 충분
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from("about_sections")
      .update({ sort_order: i })
      .eq("id", ids[i])
      .eq("photographer_id", photographerId);
    if (error) throw new Error(error.message);
  }
  revalidate(photographerId);
}
