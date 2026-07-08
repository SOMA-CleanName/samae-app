import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { ClipboardIcon } from "@/components/user/icons";
import { AdminTrash, type TrashGroup } from "./AdminTrash";

export const dynamic = "force-dynamic";

// 테이블 → 한글 라벨
const TABLE_LABEL: Record<string, string> = {
  analytics_events: "방문 로그",
  inquiries: "문의",
  categories: "카테고리",
  bookings: "거래",
  payments: "결제",
  platform_fees: "수수료",
  profiles: "회원",
  messages: "메시지",
  conversations: "대화",
  consultation_briefs: "상담 정보",
  packages: "패키지",
  photos: "사진",
  albums: "앨범",
  highlights: "하이라이트",
  highlight_items: "하이라이트 항목",
};

type Row = {
  id: string;
  table_name: string;
  record_id: string | null;
  deleted_at: string;
  deleted_by: string | null;
  actor: { display_name: string | null } | { display_name: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// 휴지통 — 삭제된 데이터 복구. 가드는 (admin)/layout.
export default async function AdminTrashPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("deleted_records")
    .select("id, table_name, record_id, deleted_at, deleted_by, actor:profiles!deleted_records_deleted_by_fkey(display_name)")
    .order("deleted_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as Row[];

  // (deleted_at, deleted_by) = 한 삭제 작업으로 그룹핑
  const map = new Map<string, TrashGroup>();
  for (const r of rows) {
    const key = `${r.deleted_at}__${r.deleted_by ?? "?"}`;
    let g = map.get(key);
    if (!g) {
      g = { key, at: r.deleted_at, byName: one(r.actor)?.display_name ?? "—", items: [] };
      map.set(key, g);
    }
    g.items.push({ id: r.id, label: TABLE_LABEL[r.table_name] ?? r.table_name });
  }
  const groups = [...map.values()];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <div>
        <h1 className="text-h1 font-semibold">휴지통</h1>
        <p className="mt-1 text-body-sm text-muted">
          삭제된 데이터를 되돌릴 수 있어요. 복구하면 원래 화면에 다시 나타나요.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState className="mt-6" icon={<ClipboardIcon className="h-7 w-7" />} title="삭제된 기록이 없어요" />
      ) : (
        <AdminTrash groups={groups} />
      )}
    </main>
  );
}
