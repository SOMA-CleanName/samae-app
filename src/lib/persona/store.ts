import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Persona } from "./schema";
import type { ShootPersona } from "./shoot-schema";

// 페르소나 결과 저장소 — 캐시(원가) · 공유 링크(바이럴 루프) · 레이트리밋(남용) 을 담당.
// 0077_persona_results.sql 참고. 아이디·IP 는 평문으로 저장하지 않는다.
//
// 저장이 실패해도 분석 자체는 성공시킨다 — 부가 기능이 본 흐름을 막지 않게.

const TABLE = "persona_results";

/** 캐시 수명. 기획서 §6-2 의 24~72시간 중 상단값. */
const TTL_HOURS = 72;

/** 같은 IP 가 이 시간 안에 (LIMIT) 회를 넘기면 막는다. */
const RATE_WINDOW_MINUTES = 60;
const RATE_LIMIT = 5;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** 인스타 아이디 → 캐시 키. 대소문자·@ 를 정규화한 뒤 해시. */
export function usernameHash(username: string): string {
  return sha256(username.replace(/^@/, "").trim().toLowerCase());
}

/**
 * IP → 레이트리밋 키. 서비스 롤 키를 솔트로 써서 해시만으로는 IP 를 역산할 수 없게 한다.
 * (별도 솔트 환경변수를 추가하지 않기 위한 선택 — 이 값은 서버에만 존재한다)
 */
export function ipHash(ip: string): string {
  return sha256(`${ip}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`);
}

export type StoredPersonaResult = {
  id: string;
  persona: Persona;
  shoot: ShootPersona;
  photoIds: string[];
};

/** TTL 안에 있는 같은 아이디의 결과를 찾는다. 없으면 null. */
export async function findCached(username: string): Promise<StoredPersonaResult | null> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from(TABLE)
      .select("id, persona, shoot, photo_ids")
      .eq("username_hash", usernameHash(username))
      .eq("pipeline_version", PIPELINE_VERSION)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id as string,
      persona: data.persona as Persona,
      shoot: data.shoot as ShootPersona,
      photoIds: (data.photo_ids as string[]) ?? [],
    };
  } catch {
    return null; // 캐시 조회 실패는 그냥 미스로 취급
  }
}

/** 공유 링크용 — id 로 결과를 되살린다. */
export async function findById(id: string): Promise<StoredPersonaResult | null> {
  // uuid 형식이 아니면 DB 를 때리지 않는다
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from(TABLE)
      .select("id, persona, shoot, photo_ids")
      .eq("id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id as string,
      persona: data.persona as Persona,
      shoot: data.shoot as ShootPersona,
      photoIds: (data.photo_ids as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

/** 결과 저장. 실패해도 throw 하지 않고 null 을 준다(분석 흐름을 막지 않기 위해). */
/** 홈 피드 재정렬이 참조할 결과 행 id 쿠키. 벡터 자체가 아니라 uuid 만 나간다 (0081 주석 참고). */
export const PERSONA_RESULT_COOKIE = "samae_persona_rid";

/** 파이프라인 버전 — 산출물 형태가 바뀌는 배포마다 1 올릴 것.
 *  캐시(findCached)는 같은 버전만 히트한다. 안 올리면 업그레이드 배포 후에도
 *  기존 사용자에게 72h 동안 구버전 결과가 나간다 (2026-08-20 실사용에서 확인).
 *  공유 링크(findById)는 버전 불문 — 이미 공유된 결과는 계속 열려야 한다.
 *  v2: 병합 호출 + 임베딩 추천 + 근거 사진 + 하이브리드 피드
 *  v3: 카드형 카피 재설계 — 필드별 글자수 제한 + keywords 칩 (combined.ts 2026-08-25) */
export const PIPELINE_VERSION = 3;

export async function saveResult(args: {
  username: string | null;
  method: "instagram" | "upload";
  persona: Persona;
  shoot: ShootPersona;
  photoIds: string[];
  ip: string | null;
  /** 분석 표본 평균 벡터(1152d, L2 정규화). 임베딩 서비스 미가동이면 null — 재정렬만 생략된다. */
  embedding?: number[] | null;
}): Promise<string | null> {
  try {
    const db = createAdminClient();
    const id = randomUUID();
    const { error } = await db.from(TABLE).insert({
      id,
      username_hash: args.username ? usernameHash(args.username) : null,
      method: args.method,
      persona: args.persona,
      shoot: args.shoot,
      photo_ids: args.photoIds,
      ip_hash: args.ip ? ipHash(args.ip) : null,
      // pgvector 는 '[..]' 문자열 리터럴을 받는다
      embedding: args.embedding && args.embedding.length === 1152 ? JSON.stringify(args.embedding) : null,
      pipeline_version: PIPELINE_VERSION,
      expires_at: new Date(Date.now() + TTL_HOURS * 3600_000).toISOString(),
    });
    if (error) return null;
    return id;
  } catch {
    return null;
  }
}

/**
 * 레이트리밋 — 최근 창(window) 안에서 같은 IP 의 실행 횟수를 센다.
 * DB 조회가 실패하면 막지 않는다(가용성 우선). IP 를 모르면 통과.
 */
export async function isRateLimited(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  try {
    const db = createAdminClient();
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
    const { count, error } = await db
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash(ip))
      .gt("created_at", since);
    if (error || count == null) return false;
    return count >= RATE_LIMIT;
  } catch {
    return false;
  }
}
