import "server-only";

// 저장된 KB 카드 → 사매 양식 안내 이미지를 구워 작가 프로필에 등록한다.
//
// 운영(어드민 [이미지 발행])과 작가(스튜디오에서 양식 변경) 둘 다 이 함수를 부른다.
// 복제하면 한쪽만 고쳐져서 같은 작가의 이미지가 화면마다 달라진다.
//
// 다시 돌려도 쌓이지 않는다 — **우리가 전에 올린 것(`sheet/` 경로)만** 지우고 새로 올린다.
// 작가가 직접 올린 안내 이미지는 건드리지 않는다.

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPhotographerKb } from "@/lib/bot-kb-db";
import { groupCardsIntoSheets, renderGuideSet } from "@/lib/guide-card-template";
import { resolveGuideStyle } from "@/lib/guide-style";

const GUIDE_BUCKET = "samae-guide";
/** 우리가 발행한 이미지만 이 접두사를 쓴다 — 작가가 직접 올린 것과 섞이지 않게 */
export const SHEET_PREFIX = "sheet";

export type BakeResult = { ok: boolean; count?: number; error?: string };

export async function rebakeGuideImages(photographerId: string): Promise<BakeResult> {
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
    // 이전 발행분 정리 — DB 행을 먼저 지우고 스토리지를 지운다(순서가 반대면 깨진 행이 남는다)
    const { data: old } = await admin
      .from("photographer_guide_images")
      .select("id")
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
    // 세트를 같은 크기로 굽는다 — 한 장씩 맞추면 레일에서 들쭉날쭉해진다
    const baked = await renderGuideSet(p.display_name ?? "", sheets, resolveGuideStyle(p.guide_style));
    const rows: Record<string, unknown>[] = [];
    for (const [i, sheet] of sheets.entries()) {
      const { png, width, height } = baked[i];
      const thumb = await sharp(png)
        .resize({ width: 500, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();

      const base = `${photographerId}/${SHEET_PREFIX}/${String(i + 1).padStart(2, "0")}-${randomUUID()}`;
      const mainPath = `${base}.png`;
      const thumbPath = `${base}_thumb.jpg`;
      const up1 = await admin.storage.from(GUIDE_BUCKET).upload(mainPath, png, {
        contentType: "image/png",
      });
      if (up1.error) throw new Error(up1.error.message);
      const up2 = await admin.storage.from(GUIDE_BUCKET).upload(thumbPath, thumb, {
        contentType: "image/jpeg",
      });
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
    return { ok: true, count: rows.length };
  } catch (e) {
    console.error("[guide-bake] failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "이미지를 만들지 못했어요." };
  }
}
