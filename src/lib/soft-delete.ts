import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type PgError = { code?: string; message?: string };

const isMissingTable = (e: PgError) =>
  e.code === "PGRST205" || e.code === "42P01" || /could not find the table/i.test(e.message ?? "");

type Filter = { col: string; op: "eq" | "in"; val: unknown };

// 조건에 맞는 행을 아카이브 후 삭제(행 단위 소프트딜리트). 없는 테이블/빈 결과는 무시.
export async function archiveAndDelete(
  table: string,
  filter: Filter,
  deletedBy: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const sel = admin.from(table).select("*");
  const selQ = filter.op === "in"
    ? sel.in(filter.col, filter.val as unknown[])
    : sel.eq(filter.col, filter.val as string);
  const { data: rows, error: selErr } = await selQ;
  if (selErr) {
    if (isMissingTable(selErr)) return {};
    return { error: `${table} 조회: ${selErr.message}` };
  }
  if (rows && rows.length > 0) {
    const archive = rows.map((r) => ({
      table_name: table,
      record_id: (r as { id?: unknown }).id != null ? String((r as { id?: unknown }).id) : null,
      data: r,
      deleted_by: deletedBy,
    }));
    for (let i = 0; i < archive.length; i += 1000) {
      const { error } = await admin.from("deleted_records").insert(archive.slice(i, i + 1000));
      if (error) return { error: `아카이브: ${error.message}` };
    }
  }
  const del = admin.from(table).delete();
  const delQ = filter.op === "in"
    ? del.in(filter.col, filter.val as unknown[])
    : del.eq(filter.col, filter.val as string);
  const { error: delErr } = await delQ;
  if (delErr && !isMissingTable(delErr)) return { error: `${table} 삭제: ${delErr.message}` };
  return {};
}

// 라이브 테이블 전체를 deleted_records 로 아카이브 후 하드 삭제(복구 가능한 소프트딜리트).
// 없는 테이블은 건너뜀. 반환: { error } (치명적 오류만)
export async function archiveAllAndDelete(
  table: string,
  deletedBy: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();

  // 1) 스냅샷
  const { data: rows, error: selErr } = await admin.from(table).select("*");
  if (selErr) {
    if (isMissingTable(selErr)) return {}; // 없는 테이블은 무시
    return { error: `${table} 조회: ${selErr.message}` };
  }

  // 2) 아카이브
  if (rows && rows.length > 0) {
    const archive = rows.map((r) => ({
      table_name: table,
      record_id: (r as { id?: unknown }).id != null ? String((r as { id?: unknown }).id) : null,
      data: r,
      deleted_by: deletedBy,
    }));
    // 대량이면 1000행씩 나눠 적재
    for (let i = 0; i < archive.length; i += 1000) {
      const { error } = await admin.from("deleted_records").insert(archive.slice(i, i + 1000));
      if (error) return { error: `아카이브: ${error.message}` };
    }
  }

  // 3) 라이브에서 제거
  const { error: delErr } = await admin.from(table).delete().not("id", "is", null);
  if (delErr && !isMissingTable(delErr)) return { error: `${table} 삭제: ${delErr.message}` };
  return {};
}
