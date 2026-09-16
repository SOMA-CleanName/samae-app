import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AxisBundle } from "@/lib/mood-axes";

// 축 배정 결과는 out/ (Git 제외, 만든 PC에만 있음) 에 있다. 화면이 그걸 그대로
// 읽으면 다른 PC 에서 빈다. build_mood_axis_bundle.py 가 화면에 필요한 것만
// 추려 저장소에 커밋해 둔다 — 검수 화면(§9-6)과 같은 방식이다.
const BUNDLE = path.join(process.cwd(), "scripts", "embed", "mood-axes-bundle.json");

let cache: AxisBundle | null = null;

/** 번들은 0.4MB다. 요청마다 파싱하지 않도록 프로세스에 한 번만 올린다. */
export async function loadAxisBundle(): Promise<AxisBundle> {
  if (!cache) cache = JSON.parse(await readFile(BUNDLE, "utf8")) as AxisBundle;
  return cache;
}
