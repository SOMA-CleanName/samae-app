import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ScreenList } from "@/lib/mood-screen";

// 1차 전처리 무드 목록은 저장소에 커밋된 파일에서 읽는다(build_screen_mood_list.py). DB 에는 쓰지 않는다.
const LIST = path.join(process.cwd(), "scripts", "embed", "mood-screen-list.json");

let cache: { at: number; list: ScreenList } | null = null;

/** 스크립트가 파일을 통째로 다시 쓴다. 바뀌면 서버를 안 껐다 켜도 새로 읽는다. */
export async function loadScreenList(): Promise<ScreenList> {
  try {
    const at = (await stat(LIST)).mtimeMs;
    if (cache?.at !== at) cache = { at, list: JSON.parse(await readFile(LIST, "utf8")) as ScreenList };
    return cache.list;
  } catch {
    return { words: [], counts: { all: 0, unsure: 0, no_axis: 0 } };
  }
}
