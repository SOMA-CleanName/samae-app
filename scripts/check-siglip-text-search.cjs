#!/usr/bin/env node
// SigLIP2 텍스트 임베딩 → 기존 pgvector RPC를 읽기 전용으로 확인한다.

const { createClient } = require("@supabase/supabase-js");

const MODEL = "google/siglip2-so400m-patch16-naflex";
const DIM = 1152;
const embedUrl = (process.env.PERSONA_EMBED_URL || "http://127.0.0.1:8077").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다");
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function embed(query) {
  const response = await fetch(`${embedUrl}/embed-text`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.PERSONA_SERVICE_TOKEN
        ? { "x-samae-token": process.env.PERSONA_SERVICE_TOKEN }
        : {}),
    },
    body: JSON.stringify({ texts: [query] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`/embed-text ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const payload = await response.json();
  const vector = payload.vectors?.[0];
  if (payload.model !== MODEL || !Array.isArray(vector) || vector.length !== DIM) {
    throw new Error(`임베딩 계약 불일치: model=${payload.model} dim=${vector?.length}`);
  }
  return { vector, inferMs: Number(payload.infer_ms) || 0 };
}

async function main() {
  const queries = process.argv.slice(2);
  if (queries.length === 0) {
    queries.push(
      "푸른 숲속 커플 사진",
      "어두운 실내 플래시 인물",
      "바다에서 뛰는 사람"
    );
  }

  for (const query of queries) {
    const { vector, inferMs } = await embed(query);
    const started = performance.now();
    const { data, error } = await admin.rpc("similar_photos_by_vector", {
      p_embedding: JSON.stringify(vector),
      p_limit: 8,
    });
    if (error) throw new Error(`similar_photos_by_vector RPC 오류: ${error.message}`);
    const rows = data || [];
    console.log(`\n“${query}” · SigLIP2 ${inferMs.toFixed(1)}ms · RPC ${(performance.now() - started).toFixed(1)}ms`);
    for (const [index, row] of rows.entries()) {
      console.log(`${String(index + 1).padStart(2)}  ${row.id}  distance=${Number(row.distance).toFixed(4)}`);
    }
  }
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
