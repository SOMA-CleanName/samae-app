// 안내 이미지 발행 (CLI) — 어드민 화면의 [이미지 발행] 과 같은 일을 커맨드로 한다.
//   npx tsx scripts/guide-publish.ts <작가id> [--cards <다듬은JSON>] [--dry]
//
// 화면 버튼은 로그인 세션이 있어야 해서 터미널에서 못 부른다. 발행 로직 자체는
// actions.ts 의 publishGuideImages 와 같고, 여기서는 service_role 로 같은 일을 한다.
//
// 다시 돌려도 쌓이지 않는다 — 우리가 전에 올린 것(`sheet/` 경로)만 지우고 새로 올린다.
// **작가가 직접 올린 안내 이미지는 건드리지 않는다.**

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { groupCardsIntoSheets, renderGuideCardFitted } from "../src/lib/guide-card-template.tsx";
import { resolveGuideStyle } from "../src/lib/guide-style.ts";
import type { KbCard } from "../src/lib/bot-kb.ts";

const BUCKET = "samae-guide";
const SHEET_PREFIX = "sheet";

function loadEnv() {
  const raw = require("node:fs").readFileSync(".env.local", "utf8") as string;
  for (const line of raw.split("\n")) {
    if (!line.includes("=") || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const pid = args[0];
  const dry = args.includes("--dry");
  const cardsPath = args[args.indexOf("--cards") + 1];
  if (!pid) throw new Error("사용법: guide-publish.ts <작가id> [--cards <JSON>] [--dry]");

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: p } = await db
    .from("photographers")
    .select("display_name, guide_style")
    .eq("id", pid)
    .maybeSingle();
  if (!p) throw new Error("작가를 찾을 수 없습니다.");

  // --cards 를 주면 그 카드를 먼저 KB 에 저장한다. 안 주면 저장된 것을 그대로 쓴다.
  let cards: KbCard[];
  if (cardsPath && args.includes("--cards")) {
    cards = JSON.parse(await readFile(cardsPath, "utf8"));
    if (!dry) {
      const { error } = await db
        .from("photographer_bot_kb")
        .update({ cards, updated_at: new Date().toISOString() })
        .eq("photographer_id", pid);
      if (error) throw new Error(`KB 저장 실패: ${error.message}`);
      console.log(`KB 저장 · 카드 ${cards.length}장`);
    }
  } else {
    const { data: kb } = await db
      .from("photographer_bot_kb")
      .select("cards")
      .eq("photographer_id", pid)
      .maybeSingle();
    cards = (kb?.cards ?? []) as KbCard[];
  }

  const sheets = groupCardsIntoSheets(cards);
  if (sheets.length === 0) throw new Error("등록된 카드가 없어요.");
  console.log(`${sheets.length}장: ${sheets.map((s) => `${s.label}(${s.cards.length})`).join(" · ")}`);
  if (dry) return console.log("(--dry: 여기까지)");

  // 이전 발행분 정리 — DB 행을 먼저 지우고 스토리지를 지운다(순서가 반대면 깨진 행이 남는다)
  const { data: old } = await db
    .from("photographer_guide_images")
    .select("id")
    .eq("photographer_id", pid)
    .like("image_url", `%/${pid}/${SHEET_PREFIX}/%`);
  if (old?.length) {
    await db.from("photographer_guide_images").delete().in("id", old.map((o) => o.id));
    const { data: listed } = await db.storage.from(BUCKET).list(`${pid}/${SHEET_PREFIX}`);
    if (listed?.length) {
      await db.storage.from(BUCKET).remove(listed.map((f) => `${pid}/${SHEET_PREFIX}/${f.name}`));
    }
    console.log(`이전 발행분 ${old.length}장 정리`);
  }

  const style = resolveGuideStyle(p.guide_style);
  const rows: Record<string, unknown>[] = [];
  for (const [i, sheet] of sheets.entries()) {
    const { png, width, height } = await renderGuideCardFitted(p.display_name ?? "", sheet, style);
    const thumb = await sharp(png)
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    const base = `${pid}/${SHEET_PREFIX}/${String(i + 1).padStart(2, "0")}-${randomUUID()}`;
    const up1 = await db.storage.from(BUCKET).upload(`${base}.png`, png, { contentType: "image/png" });
    if (up1.error) throw new Error(up1.error.message);
    const up2 = await db.storage
      .from(BUCKET)
      .upload(`${base}_thumb.jpg`, thumb, { contentType: "image/jpeg" });
    if (up2.error) throw new Error(up2.error.message);

    rows.push({
      photographer_id: pid,
      image_url: db.storage.from(BUCKET).getPublicUrl(`${base}.png`).data.publicUrl,
      thumb_url: db.storage.from(BUCKET).getPublicUrl(`${base}_thumb.jpg`).data.publicUrl,
      width,
      height,
      caption: sheet.label,
      published: true,
      sort_order: i,
    });
    console.log(`  ${i + 1}. ${sheet.label} · ${width}×${height}`);
  }

  const { error } = await db.from("photographer_guide_images").insert(rows);
  if (error) throw new Error(error.message);
  console.log(`발행 완료 · ${rows.length}장`);
}

main();
