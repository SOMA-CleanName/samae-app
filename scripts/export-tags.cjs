// 등록 사진 태그(mood_tags) 집계 → CSV/TXT 내보내기 (로컬 전용)
if (typeof globalThis.WebSocket === "undefined") globalThis.WebSocket = class { constructor() { throw 0; } };
const fs = require("fs");
for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

(async () => {
  const { data, error } = await a.from("photos").select("mood_tags, visibility");
  if (error) { console.error("ERR", error.message); process.exit(1); }

  const pub = new Map(), all = new Map();
  let pubPhotos = 0;
  for (const p of data) {
    const tags = p.mood_tags || [];
    const isPub = p.visibility === "published";
    if (isPub) pubPhotos++;
    for (const t of new Set(tags)) {
      all.set(t, (all.get(t) || 0) + 1);
      if (isPub) pub.set(t, (pub.get(t) || 0) + 1);
    }
  }
  const rows = [...all.entries()]
    .map(([t, n]) => ({ tag: t, all: n, pub: pub.get(t) || 0 }))
    .sort((x, y) => y.pub - x.pub || y.all - x.all || x.tag.localeCompare(y.tag, "ko"));

  const today = "2026-06-24";
  fs.mkdirSync("exports", { recursive: true });

  // CSV (엑셀 한글 깨짐 방지 BOM)
  let csv = "순위,태그,공개사진수,전체사진수\n";
  rows.forEach((r, i) => {
    const safe = '"' + r.tag.replace(/"/g, '""') + '"';
    csv += `${i + 1},${safe},${r.pub},${r.all}\n`;
  });
  fs.writeFileSync(`exports/photo-tags_${today}.csv`, "﻿" + csv);

  // TXT (사람이 읽기 좋은 표)
  let txt = `사매 — 등록 사진 태그 집계 (${today})\n`;
  txt += `전체 사진 ${data.length}장 (공개 ${pubPhotos}) · 고유 태그 ${rows.length}개\n`;
  txt += `공개 사진 기준 빈도 내림차순 (공개 / 전체)\n\n`;
  txt += `순위  태그                공개   전체\n`;
  txt += "-".repeat(40) + "\n";
  rows.forEach((r, i) => {
    txt += String(i + 1).padStart(3) + "  " + r.tag.padEnd(18) + String(r.pub).padStart(4) + String(r.all).padStart(6) + "\n";
  });
  fs.writeFileSync(`exports/photo-tags_${today}.txt`, txt);

  console.log(`저장 완료 (${rows.length}개 태그):`);
  console.log(` - exports/photo-tags_${today}.csv`);
  console.log(` - exports/photo-tags_${today}.txt`);
})();
