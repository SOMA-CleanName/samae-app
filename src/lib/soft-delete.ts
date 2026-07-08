import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Filter = { col: string; op: "eq" | "in"; val: unknown };

// 조건에 맞는 행을 아카이브 후 삭제(행 단위 소프트딜리트).
// SELECT→아카이브→DELETE 를 단일 트랜잭션 RPC(admin_archive_delete_where)로 원자 처리.
// 없는 테이블/빈 결과는 무시.
export async function archiveAndDelete(
  table: string,
  filter: Filter,
  deletedBy: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const vals = (filter.op === "in" ? (filter.val as unknown[]) : [filter.val]).map((v) =>
    String(v)
  );
  const { error } = await admin.rpc("admin_archive_delete_where", {
    p_table: table,
    p_col: filter.col,
    p_vals: vals,
    p_deleted_by: deletedBy,
  });
  if (error) return { error: `${table} 삭제: ${error.message}` };
  return {};
}

// 여러 라이브 테이블을 한 번의 트랜잭션으로 아카이브 후 하드 삭제(원자적).
// tables 순서 = 삭제 순서(자식 FK 먼저). 중간 실패 시 전체 롤백 → 부분 삭제 없음.
export async function archiveAllAndDeleteMany(
  tables: string[],
  deletedBy: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_archive_delete_all", {
    p_tables: tables,
    p_deleted_by: deletedBy,
  });
  if (error) return { error: `초기화: ${error.message}` };
  return {};
}

// 단일 라이브 테이블 전체를 아카이브 후 하드 삭제(복구 가능한 소프트딜리트).
export async function archiveAllAndDelete(
  table: string,
  deletedBy: string | null
): Promise<{ error?: string }> {
  return archiveAllAndDeleteMany([table], deletedBy);
}

// 선택한 거래(booking) id 들을 연관 테이블(payments·platform_fees)과 함께
// 단일 트랜잭션으로 아카이브 후 삭제(RPC admin_delete_bookings). FK 순서는 RPC 가 처리.
export async function deleteBookingsByIds(
  ids: string[],
  deletedBy: string | null
): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_delete_bookings", {
    p_ids: ids,
    p_deleted_by: deletedBy,
  });
  if (error) return { error: `거래 삭제: ${error.message}` };
  return {};
}

// deleted_records 의 지정 행들을 원본 테이블로 복구(RPC admin_restore_records).
// 부모→자식 순서·단일 트랜잭션은 RPC 가 처리. 복구된 행은 deleted_records 에서 제거됨.
export async function restoreRecords(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_restore_records", { p_ids: ids });
  if (error) return { error: `복구: ${error.message}` };
  return {};
}
