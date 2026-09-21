"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseKbJson } from "@/lib/bot-kb-db";
import { getPhotographerKb } from "@/lib/bot-kb-data";
import { extractKbFromMaterial, type KbConflict } from "@/lib/kb-extract";
import { polishCards, type PolishedCard } from "@/lib/kb-style";
import { fetchPhotographerKb } from "@/lib/bot-kb-db";
import { renderGuideCardFitted, groupCardsIntoSheets } from "@/lib/guide-card-template";
import { resolveGuideStyle, type GuideStyle } from "@/lib/guide-style";
import { randomUUID } from "crypto";

// 이번 단계 정책: KB 는 운영진만 쓴다 (테이블 RLS 도 write=is_admin).
// 서버액션은 RLS 를 우회하는 admin 클라이언트를 쓰므로 역할 검사를 여기서 먼저 한다.
async function assertAdmin() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
}

export type SaveKbState = {
  ok: boolean;
  errors: string[];
  /** 저장 성공 시 카드 수 — 편집기가 "N장 저장됨" 을 띄운다 */
  count?: number;
};

/**
 * KB 저장 (useActionState 시그니처).
 * 검증에 하나라도 걸리면 **아무것도 저장하지 않는다** — 나쁜 카드만 조용히 빠지면
 * 운영은 저장된 줄 알고, 봇은 그 사실을 모른 채 답을 못 하게 된다.
 */
export async function saveBotKb(_prev: SaveKbState, formData: FormData): Promise<SaveKbState> {
  await assertAdmin();

  const photographerId = String(formData.get("photographerId") ?? "").trim();
  if (!photographerId) return { ok: false, errors: ["작가가 지정되지 않았습니다."] };

  const { cards, errors } = parseKbJson(String(formData.get("cards") ?? ""));
  if (errors.length > 0) return { ok: false, errors };

  const admin = createAdminClient();
  const { error } = await admin.from("photographer_bot_kb").upsert(
    {
      photographer_id: photographerId,
      cards,
      greeting: String(formData.get("greeting") ?? "").trim(),
      enabled: formData.get("enabled") === "on",
      note: String(formData.get("note") ?? "").trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "photographer_id" }
  );
  if (error) return { ok: false, errors: [error.message] };

  revalidatePath("/admin/bot-kb");
  return { ok: true, errors: [], count: cards.length };
}

export type ExtractState = {
  /** 편집기에 채울 카드 JSON — 비면 실패 */
  cardsJson: string;
  conflicts: KbConflict[];
  questions: string[];
  held: { id: string; body: string; reason: string }[];
  missingCoreTopics: string[];
  error?: string;
};

/**
 * 작가가 보내온 자료 → 카드 초안 + 불일치 + 질문.
 *
 * **저장하지 않는다.** 편집기에 채워 넣기만 하고, 운영이 보고 고친 뒤 [저장]을 누른다.
 * 대조 기준은 셋이다 — 자료 · 사매 패키지 · 사매 소개글(작가가 직접 쓴 글이라 패키지와
 * 어긋나 있는 경우가 실제로 있었다).
 *
 * 큰 모델로 긴 자료를 읽어 2분 가까이 걸린다. 화면에서 진행 표시가 필요하다.
 */
/**
 * 지금 편집 중인 카드의 **문장만** 다듬는다.
 *
 * 저장된 카드가 아니라 화면에 떠 있는 카드를 받는다 — 저장 전에 문장을 보고
 * 고칠 수 있어야 하고, 다듬기 결과를 바로 저장해 버리면 되돌릴 방법이 없다.
 * 적용 여부는 사람이 카드마다 고른다.
 */
export async function polishKbCards(
  cards: { id: string; topic: string; body: string }[]
): Promise<{ polished: PolishedCard[]; error?: string }> {
  await assertAdmin();
  const usable = (cards ?? []).filter((c) => c?.id?.trim() && c?.body?.trim());
  if (usable.length === 0) return { polished: [], error: "다듬을 카드가 없어요." };
  try {
    const polished = await polishCards(
      usable.map((c) => ({ id: c.id, topic: c.topic, body: c.body, source: "작가 답변" }))
    );
    return { polished };
  } catch (e) {
    console.error("[bot-kb] polish failed:", e);
    return { polished: [], error: e instanceof Error ? e.message : "문장을 다듬지 못했어요." };
  }
}

export async function extractKbFromText(
  photographerId: string,
  material: string
): Promise<ExtractState> {
  await assertAdmin();
  const empty: ExtractState = {
    cardsJson: "",
    conflicts: [],
    questions: [],
    held: [],
    missingCoreTopics: [],
  };
  if (!material.trim()) return { ...empty, error: "작가 자료를 붙여넣어 주세요." };

  const admin = createAdminClient();
  const [{ data: p }, { data: pk }] = await Promise.all([
    admin
      .from("photographers")
      .select("display_name, bio, price_from_krw, travel_fee_krw")
      .eq("id", photographerId)
      .maybeSingle(),
    admin
      .from("packages")
      .select("name, description, price_krw, duration_min, edited_count, is_active")
      .eq("photographer_id", photographerId),
  ]);
  if (!p) return { ...empty, error: "작가를 찾을 수 없습니다." };

  try {
    const result = await extractKbFromMaterial({
      photographerName: p.display_name ?? "",
      material,
      samae: {
        bio: p.bio,
        priceFromKrw: p.price_from_krw,
        travelFeeKrw: p.travel_fee_krw,
        packages: (pk ?? []).map((x) => ({
          name: x.name,
          description: x.description,
          priceKrw: x.price_krw,
          durationMin: x.duration_min,
          editedCount: x.edited_count,
          isActive: x.is_active,
        })),
      },
    });
    return {
      cardsJson: JSON.stringify(result.cards, null, 2),
      conflicts: result.conflicts,
      questions: result.questions,
      held: result.held.map((h) => ({ id: h.card.id, body: h.card.body, reason: h.reason })),
      missingCoreTopics: result.missingCoreTopics,
    };
  } catch (e) {
    console.error("[bot-kb] extract failed:", e);
    return { ...empty, error: e instanceof Error ? e.message : "추출에 실패했어요." };
  }
}

const GUIDE_BUCKET = "samae-guide";
/** 우리가 발행한 이미지만 이 접두사를 쓴다 — 작가가 직접 올린 것과 섞이지 않게 */
const SHEET_PREFIX = "sheet";

export type PublishGuideState = { ok: boolean; count?: number; error?: string };

/**
 * 저장된 KB 카드 → 사매 양식 안내 이미지를 만들어 작가 프로필에 등록한다.
 *
 * `/api/guide/upload` 는 로그인한 **본인 작가**만 올릴 수 있어서, 운영이 만든 이미지를
 * 그 경로로는 등록할 수 없다. 그래서 어드민 전용 경로를 따로 둔다.
 *
 * 다시 눌러도 쌓이지 않는다 — 우리가 이전에 발행한 것(`sheet/` 경로)만 지우고 새로 올린다.
 * **작가가 직접 올린 안내 이미지는 건드리지 않는다.**
 */
export async function publishGuideImages(photographerId: string): Promise<PublishGuideState> {
  await assertAdmin();
  const admin = createAdminClient();

  const { data: p } = await admin
    .from("photographers")
    .select("display_name, guide_style")
    .eq("id", photographerId)
    .maybeSingle();
  if (!p) return { ok: false, error: "작가를 찾을 수 없습니다." };

  const kb = await fetchPhotographerKb(photographerId, p.display_name ?? "");
  const sheets = groupCardsIntoSheets(kb?.cards ?? []);
  if (sheets.length === 0) {
    return { ok: false, error: "등록된 카드가 없어요. 카드를 먼저 저장해주세요." };
  }

  try {
    // 이전 발행분 정리 — DB 행 먼저 지우고 스토리지를 지운다(순서가 반대면 깨진 행이 남는다)
    const { data: old } = await admin
      .from("photographer_guide_images")
      .select("id, image_url")
      .eq("photographer_id", photographerId)
      .like("image_url", `%/${photographerId}/${SHEET_PREFIX}/%`);
    if (old && old.length > 0) {
      await admin
        .from("photographer_guide_images")
        .delete()
        .in("id", old.map((o) => o.id));
      const { data: listed } = await admin.storage
        .from(GUIDE_BUCKET)
        .list(`${photographerId}/${SHEET_PREFIX}`);
      if (listed && listed.length > 0) {
        await admin.storage
          .from(GUIDE_BUCKET)
          .remove(listed.map((f) => `${photographerId}/${SHEET_PREFIX}/${f.name}`));
      }
    }

    const sharp = (await import("sharp")).default;
    const rows: Record<string, unknown>[] = [];
    for (const [i, sheet] of sheets.entries()) {
      const { png, width, height } = await renderGuideCardFitted(
        p.display_name ?? "",
        sheet,
        resolveGuideStyle(p.guide_style)
      );
      const thumb = await sharp(png).resize({ width: 500, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();

      const base = `${photographerId}/${SHEET_PREFIX}/${String(i + 1).padStart(2, "0")}-${randomUUID()}`;
      const mainPath = `${base}.png`;
      const thumbPath = `${base}_thumb.jpg`;
      const up1 = await admin.storage
        .from(GUIDE_BUCKET)
        .upload(mainPath, png, { contentType: "image/png" });
      if (up1.error) throw new Error(up1.error.message);
      const up2 = await admin.storage
        .from(GUIDE_BUCKET)
        .upload(thumbPath, thumb, { contentType: "image/jpeg" });
      if (up2.error) throw new Error(up2.error.message);

      rows.push({
        photographer_id: photographerId,
        image_url: admin.storage.from(GUIDE_BUCKET).getPublicUrl(mainPath).data.publicUrl,
        thumb_url: admin.storage.from(GUIDE_BUCKET).getPublicUrl(thumbPath).data.publicUrl,
        width,
        height,
        caption: sheet.label,
        published: true,
        sort_order: i,
      });
    }

    const { error } = await admin.from("photographer_guide_images").insert(rows);
    if (error) throw new Error(error.message);

    revalidatePath("/admin/bot-kb");
    return { ok: true, count: rows.length };
  } catch (e) {
    console.error("[bot-kb] publishGuideImages failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "이미지 발행에 실패했어요." };
  }
}

/**
 * 파일 데모(bot-kb-data.ts)의 카드를 그대로 JSON 텍스트로 뽑아준다.
 * 하드코딩 KB 를 DB 로 옮길 때 운영이 다시 타이핑하지 않게 하려는 용도 — 저장은 하지 않는다.
 */
export async function seedFromDemo(photographerId: string): Promise<{ text: string; error?: string }> {
  await assertAdmin();
  const kb = getPhotographerKb(photographerId, "");
  if (!kb || kb.cards.length === 0) {
    return { text: "", error: "이 작가에게는 파일 데모 카드가 없습니다." };
  }
  return { text: JSON.stringify(kb.cards, null, 2) };
}

/** 작가별 안내 이미지 양식 저장 — 템플릿·배경지·배경 사진. */
export async function saveGuideStyle(
  photographerId: string,
  style: GuideStyle
): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin();
  // 모르는 값이 들어와도 기본값으로 떨어뜨려 저장한다 — 화면이 깨지는 것보다 낫다
  const safe = resolveGuideStyle(style);
  const admin = createAdminClient();
  const { error } = await admin
    .from("photographers")
    .update({ guide_style: safe })
    .eq("id", photographerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/bot-kb");
  return { ok: true };
}

/**
 * 안내 이미지 배경으로 쓸 사진 업로드.
 *
 * 배경으로만 쓰이고 글자는 그 위 반투명 종이 안에 앉으므로, 원본 해상도를 유지할
 * 이유가 없다. 폭 1080 으로 줄여 저장한다 — 이미지를 구울 때마다 이 파일을 다시
 * 읽으므로 작을수록 좋다.
 */
export async function uploadGuideBackdrop(
  formData: FormData
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await assertAdmin();
  const photographerId = String(formData.get("photographerId") ?? "").trim();
  const file = formData.get("file");
  if (!photographerId) return { ok: false, error: "작가가 지정되지 않았습니다." };
  if (!(file instanceof File)) return { ok: false, error: "파일이 없습니다." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "이미지 파일만 올릴 수 있어요." };
  if (file.size > 15 * 1024 * 1024) return { ok: false, error: "15MB 이하만 올릴 수 있어요." };

  try {
    const sharp = (await import("sharp")).default;
    const buf = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1080, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const admin = createAdminClient();
    const path = `${photographerId}/${SHEET_PREFIX}/backdrop-${randomUUID()}.jpg`;
    const { error } = await admin.storage
      .from(GUIDE_BUCKET)
      .upload(path, buf, { contentType: "image/jpeg" });
    if (error) return { ok: false, error: error.message };
    return { ok: true, url: admin.storage.from(GUIDE_BUCKET).getPublicUrl(path).data.publicUrl };
  } catch (e) {
    console.error("[bot-kb] backdrop upload failed:", e);
    return {
      ok: false,
      error: "이미지를 처리할 수 없어요. HEIC(아이폰 원본)이면 JPG 로 바꿔 올려주세요.",
    };
  }
}
