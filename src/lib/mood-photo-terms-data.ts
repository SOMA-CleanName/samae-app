import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PhotoTermAxes, PhotoTermEdit, PhotoTermMerge } from "@/lib/mood-photo-terms";

// 사람이 살리거나 뺀 기록 — term-edits.jsonl 과 같은 이유로 커밋되는 자리에 둔다(다른 PC 에서도 같은 화면).
const EDITS = path.join(process.cwd(), "scripts", "embed", "mood-edits", "photo-term-edits.jsonl");
// 묶음 안 같은 낱말의 다른 표기 흡수 — find_photo_term_merges.py 가 통째로 다시 쓴다
const MERGES = path.join(process.cwd(), "scripts", "embed", "mood-edits", "photo-term-merges.jsonl");
// 축 없는 말(작가 태그에만 있는 것)에 사람이 붙인 축
const AXES = path.join(process.cwd(), "scripts", "embed", "mood-edits", "photo-term-axes.jsonl");

// 묶음 — build_photo_groups.py 가 통째로 다시 쓴다. 묶음에는 대표가 없다
const GROUPS = path.join(process.cwd(), "scripts", "embed", "mood-edits", "photo-groups.json");
export type PhotoGroups = { made_at: string; terms: number; judged: number; groups: { members: string[] }[]; relations: [string, string][] };

export async function loadPhotoGroups(): Promise<PhotoGroups | null> {
  try {
    return JSON.parse(await readFile(GROUPS, "utf8")) as PhotoGroups;
  } catch {
    return null;   // 아직 묶지 않았다
  }
}

export async function loadPhotoTermAxes(): Promise<PhotoTermAxes[]> {
  try {
    return (await readFile(AXES, "utf8")).split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as PhotoTermAxes);
  } catch {
    return [];
  }
}

export async function loadPhotoTermMerges(): Promise<PhotoTermMerge[]> {
  try {
    return (await readFile(MERGES, "utf8")).split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as PhotoTermMerge);
  } catch {
    return [];
  }
}

export async function loadPhotoTermEdits(): Promise<PhotoTermEdit[]> {
  try {
    return (await readFile(EDITS, "utf8")).split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as PhotoTermEdit);
  } catch {
    return [];   // 아직 아무것도 손대지 않은 상태
  }
}

/** 한 줄씩 덧붙인다. 되돌리기도 새 줄로 남겨 무엇을 언제 바꿨는지가 사라지지 않는다. */
export async function appendPhotoTermEdit(edit: PhotoTermEdit) {
  await mkdir(path.dirname(EDITS), { recursive: true });
  const existing = await loadPhotoTermEdits();
  await writeFile(EDITS, [...existing, edit].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}
