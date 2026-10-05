"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeVectors, latestNewConfirms, newPhotoRow, proposalCut, proposedFamilies, scoreNewPhoto } from "@/lib/mood-new-photos";
import {
  writeFamilyIndex, appendNewConfirm, loadFamilyModel, loadFamilyReviews, loadNewConfirms, loadNewPhotoTags, loadPhotoMoodTagsBase, writeNewPhotoTags, type NewPhotoTags,
  appendBandConfirm, appendFamilyPromptEdit, appendFamilyPromptKoEdit, appendFamilyReview, appendPhotoMoodTagEdit, loadFamilyPromptDrafts, loadFamilyPromptEdits,
  loadBandConfirms, loadFamilyPromptKoDrafts, loadFamilyPromptKoEdits, loadPhotoMoodLayers, loadPhotoMoodTagEdits, loadPhotoMoodTags,
} from "@/lib/mood-photo-layers-data";
import {
  addedTags, BANDS, cleanCaption, confirmedPhotos, familyCut, latestReviews, droppedTags, familyKoFor, familyPromptsFor, hasHangul, inBand, latestConfirms, nextBand, parsePromptText, photosWithTag, planTranslation,
  type FamilyReviewStatus, type TagLayer,
} from "@/lib/mood-photo-tags";

/**
 * 사진 태그 검수 — 틀린 태그를 빼거나 되살린다(docs/47 §5). 기록은 mood-edits/photo-mood-tag-edits.jsonl, 마지막 줄이 이긴다.
 * DB 에는 쓰지 않는다 — 검수가 끝나면 반영 단계(아직 안 함)가 이 기록을 걸러 쓴다.
 */
export async function editPhotoMoodTag(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const photo = String(formData.get("photo") ?? "");
  const layer = String(formData.get("layer") ?? "") as TagLayer;
  const key = String(formData.get("key") ?? "");
  const action = String(formData.get("action") ?? "");
  if ((layer !== "family" && layer !== "big") || (action !== "drop" && action !== "keep")) return;
  const [tags, edits] = await Promise.all([loadPhotoMoodTags(), loadPhotoMoodTagEdits()]);
  const row = tags?.photos[photo];
  const has = (layer === "family" ? row?.families.some(([k]) => k === key) : row?.moods.some(([k]) => k === key))
    || addedTags(edits).has(`${photo}|${layer}|${key}`);    // 사람이 직접 붙인 태그도 뺄 수 있다
  if (!has) return;                                      // 붙지 않은 태그를 빼면 기록만 쌓인다
  await appendPhotoMoodTagEdit({ photo, layer, key, action, at: new Date().toISOString() });
  await writeFamilyIndex();                                   // 검색이 읽는 색인(docs/47 §9)
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/**
 * 가족의 영어 문장 고치기 — 한 줄에 한 문장(docs/47 §3). 칸은 무드 › D4 가족 카드에 있다(key 는 v1 가족 키). 기록 mood-edits/photo-family-prompt-edits.jsonl, 마지막 줄이 이긴다.
 * 저장만으로는 사진 태그가 바뀌지 않는다 — tag_photo_moods.py 를 다시 돌려야 한다(8077 서버가 필요해서 화면에서 돌리지 않는다).
 */
export async function saveFamilyPrompts(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  if (!(await loadPhotoMoodLayers())?.families.some((f) => f.key === key)) return;
  const prompts = parsePromptText(String(formData.get("prompts") ?? ""));
  if (!prompts.length) return;                           // 문장이 하나도 없으면 점수를 못 낸다 — 저장하지 않는다
  await appendFamilyPromptEdit({ key, prompts, at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/mood/families/photo");     // 문장 칸은 무드 › D4 가족 카드에 있다(사람 요청 2026-10-01)
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/**
 * 가족 판정(docs/47 §5) — 통과 · 문장 고칠 것 · 판정 지우기(todo). 기준(cut)은 setFamilyCut 이 따로 기억한다(통과해도 기준이 남게).
 * 기록 mood-edits/photo-mood-family-reviews.jsonl, 가족마다 마지막 줄이 이긴다. DB 에는 아직 쓰지 않는다.
 */
export async function reviewFamily(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  const status = String(formData.get("status") ?? "") as FamilyReviewStatus;
  if (!["pass", "rewrite", "todo"].includes(status)) return;
  if (!(await loadPhotoMoodLayers())?.families.some((f) => f.key === key)) return;
  await appendFamilyReview({ key, status, at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/**
 * 가족마다 기준 z(사람 결정 2026-10-01: 태그마다 기준을 다르게). 빈 값 · reset 이면 기본으로.
 * 저장된 바닥(z_floor) 아래 값은 바닥으로 읽힌다(familyCut). 소수 둘째 자리까지.
 */
export async function setFamilyCut(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  if (!(await loadPhotoMoodLayers())?.families.some((f) => f.key === key)) return;
  const raw = String(formData.get("cut") ?? "").trim();
  const cut = raw === "" || formData.get("reset") ? null : Number(raw);
  if (cut !== null && !(Number.isFinite(cut) && cut > 0 && cut < 10)) return;
  await appendFamilyReview({ key, cut: cut === null ? null : Math.round(cut * 100) / 100, at: new Date().toISOString() });
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const CAPTION_SYSTEM =
  "You turn a short Korean description of a photo into ONE English caption for an image-search model (SigLIP). " +
  "Start with \"a photo of\" — or \"a black and white photo of\" / \"a film photo of\" when the style itself is described. " +
  "Translate faithfully: describe only what the Korean says, never invent clothing, accessories, colors or other details it does not mention. " +
  "Keep it visual — subject, pose, expression, setting, light, colors. 8 to 20 words. Output the sentence only, no quotes, no Korean.";

/** 한글 한 줄 → 영어 문장(로컬 qwen3:14b). 실패는 null */
async function toCaption(korean: string): Promise<string | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:14b", stream: false, think: false, options: { temperature: 0.2, num_predict: 60 },
        messages: [
          { role: "system", content: CAPTION_SYSTEM },
          { role: "user", content: "노을 지는 바닷가에서 역광으로 실루엣만 보이는 커플" },
          { role: "assistant", content: "a photo of a couple silhouetted against the sunset on a beach, backlit by orange light" },
          { role: "user", content: korean },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return null;
    return cleanCaption(((await response.json()) as { message?: { content?: string } }).message?.content ?? "");
  } catch {
    return null;
  }
}

/**
 * 한글 칸 → 영어 칸(사람 요청 2026-10-01 — 영어로 쓰기 귀찮다, 영어 칸 아래 한글 칸).
 * **바뀐 한글 줄만** 로컬 qwen 이 "a photo of …" 로 번역하고, 그대로인 줄은 짝 영어를 그대로 쓴다(planTranslation) — 한 줄만 고쳤는데
 * 나머지 줄 뜻까지 흔들리지 않게. 한글 칸이 비어 있으면 예전처럼 영어 칸에 쓴 한글 줄을 바꾼다.
 * 바꾸지 못한 줄이 있으면 저장하지 않는다(한글이 섞이면 SigLIP 이 못 읽는다). 로컬 Ollama 가 있어야 한다 — 배포된 어드민에서는 동작하지 않는다.
 */
export async function translateFamilyPrompts(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  if (!(await loadPhotoMoodLayers())?.families.some((f) => f.key === key)) return;
  const ko = parsePromptText(String(formData.get("prompts_ko") ?? ""));
  const fail = () => { throw new Error("한글 문장을 영어로 바꾸지 못했습니다 — 로컬 qwen(Ollama)이 켜져 있는지 확인해 주세요."); };

  if (!ko.length) {                                      // 한글 칸이 비었다 — 영어 칸에 쓴 한글 줄만 바꾼다
    const lines = parsePromptText(String(formData.get("prompts") ?? ""));
    if (!lines.length) return;
    const out = await Promise.all(lines.map((line) => (hasHangul(line) ? toCaption(line) : Promise.resolve(line))));
    if (out.some((line) => !line)) fail();
    await appendFamilyPromptEdit({ key, prompts: out as string[], at: new Date().toISOString() });
  } else {
    const [drafts, edits, koDrafts, koEdits] = await Promise.all([loadFamilyPromptDrafts(), loadFamilyPromptEdits(), loadFamilyPromptKoDrafts(), loadFamilyPromptKoEdits()]);
    const english = familyPromptsFor(key, drafts, edits).prompts;
    const before = familyKoFor(key, english, koDrafts, koEdits);
    const plan = planTranslation(ko, before.lines, before.pairedEn);
    const out = await Promise.all(plan.map((p) => (p.keep ? Promise.resolve(p.keep) : hasHangul(p.ko) ? toCaption(p.ko) : Promise.resolve(p.ko))));
    if (out.some((line) => !line)) fail();
    const at = new Date().toISOString();
    await appendFamilyPromptEdit({ key, prompts: out as string[], at });
    await appendFamilyPromptKoEdit({ key, prompts_ko: ko, prompts_en: out as string[], at });
  }
  revalidatePath("/admin/photo-purpose/mood/families/photo");
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/**
 * 단계별 소거 — 이 구간을 통과(사람 결정 2026-10-01). 구간에 든 사진 중 **빼지 않은 것**을 이 가족 태그로 확정한다.
 * 기록 mood-edits/photo-mood-tag-confirmed.jsonl {key, band, photos}. 확정 뒤 다음 구간(사진이 있는 다음 아래 구간)으로 넘어간다.
 */
export async function confirmBand(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  const band = Number(formData.get("band"));
  if (!BANDS.includes(band as (typeof BANDS)[number])) return;
  const [tags, edits] = await Promise.all([loadPhotoMoodTags(), loadPhotoMoodTagEdits()]);
  if (!tags || !(await loadPhotoMoodLayers())?.families.some((f) => f.key === key)) return;
  const dropped = droppedTags(edits);
  // 이미 확정한 사진은 빼고 이 구간의 새 사진만 — 그리고 이 구간에 전에 확정한 사진에 **더한다**(덮어쓰지 않는다).
  // 다시 계산해 점수가 바뀌면 통과한 구간에도 새 사진이 들어온다(사람 결정 2026-10-02)
  const before = latestConfirms(await loadBandConfirms());
  const done = new Set(confirmedPhotos(key, before, dropped));
  const rows = photosWithTag(tags, "family", key, dropped).filter((r) => !done.has(r.photo));
  const fresh = inBand(rows, band).filter((r) => !r.dropped).map((r) => r.photo);
  const prev = before.get(key)?.get(band) ?? [];
  await appendBandConfirm({ key, band, photos: [...new Set([...prev, ...fresh])], at: new Date().toISOString() });
  await writeFamilyIndex();                                   // 검색이 읽는 색인(docs/47 §9)
  revalidatePath("/admin/photo-purpose/tags", "layout");
  const next = nextBand(rows.filter((r) => !fresh.includes(r.photo)));
  redirect(`/admin/photo-purpose/tags?key=${key}${next === null ? "&show=done" : `&band=${next}`}`);
}

/** 구간 확정 취소 — 그 구간을 다시 검수 전으로 */
export async function undoBand(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  const band = Number(formData.get("band"));
  if (!BANDS.includes(band as (typeof BANDS)[number])) return;
  await appendBandConfirm({ key, band, photos: null, at: new Date().toISOString() });
  await writeFamilyIndex();                                   // 검색이 읽는 색인(docs/47 §9)
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/**
 * 이 구간 사진을 한꺼번에 빼기 · 되살리기(사람 요청 2026-10-01 — 구간 전체가 그 가족과 안 맞을 때).
 * 사진마다 한 장씩 뺀 것과 똑같이 photo-mood-tag-edits.jsonl 에 한 줄씩 남긴다 — 다른 구간 · 가족 기준에는 영향이 없다.
 */
export async function dropBand(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const key = String(formData.get("key") ?? "");
  const band = Number(formData.get("band"));
  const action = String(formData.get("action") ?? "") === "keep" ? "keep" : "drop";
  if (!BANDS.includes(band as (typeof BANDS)[number])) return;
  const [tags, edits] = await Promise.all([loadPhotoMoodTags(), loadPhotoMoodTagEdits()]);
  if (!tags || !(await loadPhotoMoodLayers())?.families.some((f) => f.key === key)) return;
  const rows = inBand(photosWithTag(tags, "family", key, droppedTags(edits)), band).filter((r) => (action === "drop" ? !r.dropped : r.dropped));
  const at = new Date().toISOString();
  for (const r of rows) await appendPhotoMoodTagEdit({ photo: r.photo, layer: "family", key, action, at });
  await writeFamilyIndex();                                   // 검색이 읽는 색인(docs/47 §9)
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

// ── 신규 사진(docs/47 §6, 2026-10-05) ──────────────────────────────────────────────────────

const NEW_PAGE = "/admin/photo-purpose/tags/new";
/** 한 번에 매길 새 사진 수 — 벡터를 DB 에서 읽어 와 매기므로 너무 많으면 화면이 오래 멈춘다 */
const NEW_BATCH = 300;

const parseVec = (v: unknown): number[] | null =>
  v == null ? null : Array.isArray(v) ? (v as number[]) : typeof v === "string" ? (JSON.parse(v) as number[]) : null;

/**
 * 새 사진 불러오기 — 공개 · 임베딩이 있는데 아직 무드 점수가 없는 사진을 굳힌 기준(photo-family-model.json)으로 매긴다.
 * 결과는 photo-mood-tags-new.json 에 쌓이고, 검수 화면이 사진 한 장씩 보여준다. 기존 사진 점수는 건드리지 않는다.
 * 기준의 문장 지문이 태그 결과와 다르면(문장을 고쳤다) 매기지 않는다 — 전체를 다시 돌려야 한다.
 */
export async function fetchNewPhotos() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const [model, base, layers, prev] = await Promise.all([loadFamilyModel(), loadPhotoMoodTagsBase(), loadPhotoMoodLayers(), loadNewPhotoTags()]);
  if (!model || !base || !layers) redirect(`${NEW_PAGE}?err=nomodel`);
  if (model.prompts_hash !== base.prompts_hash) redirect(`${NEW_PAGE}?err=hash`);
  const store: NewPhotoTags = prev && prev.prompts_hash === model.prompts_hash
    ? prev : { made_at: "", prompts_hash: model.prompts_hash, photos: {} };

  const admin = createAdminClient();
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("photos").select("id")
      .eq("visibility", "published").not("embedding", "is", null).order("id").range(from, from + 999);
    if (error) throw error;
    ids.push(...(data ?? []).map((r) => r.id as string));
    if ((data ?? []).length < 1000) break;
  }
  const fresh = ids.filter((id) => !base.photos[id] && !store.photos[id]).slice(0, NEW_BATCH);

  const vectors = decodeVectors(model);
  const bigOf = new Map(layers.families.map((f) => [f.key, f.big]));
  const now = new Date().toISOString();
  for (let i = 0; i < fresh.length; i += 40) {
    const { data, error } = await admin.from("photos").select("id, embedding, tone_vec, mood_tags, generated_tags").in("id", fresh.slice(i, i + 40));
    if (error) throw error;
    for (const r of data ?? []) {
      const embedding = parseVec(r.embedding);
      if (!embedding) continue;
      const photo = { embedding, tone: parseVec(r.tone_vec), tags: [...((r.mood_tags as string[] | null) ?? []), ...((r.generated_tags as string[] | null) ?? [])] };
      const all = scoreNewPhoto(model, vectors, photo, -Infinity);
      const families = all.filter(([, z]) => z >= model.z_floor);
      store.photos[r.id as string] = { ...newPhotoRow(families, bigOf, model.z_cut, all.slice(0, 3).map(([k, z]) => [k, z])), added_at: now };
    }
  }
  store.made_at = now;
  await writeNewPhotoTags(store);
  revalidatePath("/admin/photo-purpose/tags", "layout");
  redirect(`${NEW_PAGE}?got=${fresh.length}`);
}

/** 이 사진 확정 — 지금 제안된 가족에서 뺀 것을 빼고 남은 가족을 확정한다. 검색 색인에 바로 들어간다 */
export async function confirmNewPhoto(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const photo = String(formData.get("photo") ?? "");
  const [tags, edits, reviewRows, confirmRows] = await Promise.all([loadPhotoMoodTags(), loadPhotoMoodTagEdits(), loadFamilyReviews(), loadBandConfirms()]);
  const row = tags?.photos[photo];
  if (!tags || !row || !tags.added?.[photo]) return;
  const reviews = latestReviews(reviewRows);
  const confirms = latestConfirms(confirmRows);
  const dropped = droppedTags(edits);
  const cutOf = (key: string) => proposalCut(familyCut(key, reviews, tags.z_cut, tags.z_floor), confirms.get(key)?.keys());
  const proposed = proposedFamilies(photo, row, cutOf, (key) => reviews.get(key)?.status === "rewrite", dropped).filter((f) => !f.dropped).map((f) => f.key);
  // 사람이 [+ 태그 추가] 로 직접 붙인 가족도 함께 확정한다
  const mine = [...addedTags(edits)].filter((id) => id.startsWith(`${photo}|family|`) && !dropped.has(id)).map((id) => id.split("|")[2]);
  const kept = [...new Set([...proposed, ...mine])];
  await appendNewConfirm({ photo, families: kept, at: new Date().toISOString() });
  await writeFamilyIndex();
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/** 확정 되돌리기 — 다시 검수 대기로 */
export async function undoNewPhoto(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const photo = String(formData.get("photo") ?? "");
  if (!latestNewConfirms(await loadNewConfirms()).has(photo)) return;
  await appendNewConfirm({ photo, families: null, at: new Date().toISOString() });
  await writeFamilyIndex();
  revalidatePath("/admin/photo-purpose/tags", "layout");
}

/**
 * 태그 직접 붙이기(사람 요청 2026-10-05) — 점수가 기준에 못 미쳐도 사람이 보기에 맞는 가족을 사진에 붙인다.
 * 빼기와 같은 기록(photo-mood-tag-edits.jsonl, action add). 확정과 같게 쳐서 검색 색인에 바로 들어간다. 빼면(drop) 다시 빠진다.
 */
export async function addPhotoMoodTag(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const photo = String(formData.get("photo") ?? "");
  const key = String(formData.get("key") ?? "");
  const [layers, tags] = await Promise.all([loadPhotoMoodLayers(), loadPhotoMoodTags()]);
  if (!layers?.families.some((f) => f.key === key) || !tags?.photos[photo]) return;
  await appendPhotoMoodTagEdit({ photo, layer: "family", key, action: "add", at: new Date().toISOString() });
  await writeFamilyIndex();
  revalidatePath("/admin/photo-purpose/tags", "layout");
}
