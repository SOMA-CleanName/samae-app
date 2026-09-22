import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { fetchRemovalFacts } from "@/lib/removal-facts";
import { buildRemovalReport, type RemovalItem } from "@/lib/removal-report";
import { approvePhotographer, removePhotographer } from "../../actions";
import { PendingButton } from "@/components/ui/SubmitButton";

/**
 * 작가 퇴출 점검.
 *
 * 퇴출은 하드 딜리트라 되돌릴 수 없다. 그래서 목록의 [퇴출] 은 이제 삭제가 아니라
 * **정지 + 이 화면**으로 온다(actions/beginRemoval). 여기서 무엇이 걸려 있는지 전부
 * 보여주고, 🔴 가 하나도 없을 때만 실행 버튼이 열린다.
 *
 * 화면이 막아도 서버가 한 번 더 센다(removePhotographer) — 이 화면을 띄워 둔 사이에
 * 예약이 잡힐 수 있고, 폼은 직접 던질 수도 있다.
 */
export const dynamic = "force-dynamic";

const TONE: Record<RemovalItem["level"], { badge: string; box: string; mark: string }> = {
  block: { badge: "text-danger-ink border-danger/30", box: "border-danger/20 bg-danger/[0.03]", mark: "🔴" },
  unknown: { badge: "text-warning-ink border-warning/30", box: "border-warning/20 bg-warning/[0.03]", mark: "⚠️" },
  auto: { badge: "text-muted border-line-strong", box: "border-line", mark: "🟡" },
  info: { badge: "text-faint border-line", box: "border-line", mark: "✅" },
};

const SECTIONS: Array<{ level: RemovalItem["level"]; title: string; lead: string }> = [
  { level: "block", title: "해소해야 퇴출할 수 있어요", lead: "하나라도 남아 있으면 퇴출 버튼이 열리지 않아요." },
  { level: "unknown", title: "확인할 수 없는 항목", lead: "시스템이 대신 세어 줄 수 없어요. 직접 확인해주세요." },
  { level: "auto", title: "퇴출하면 같이 처리돼요", lead: "따로 손대지 않아도 실행할 때 함께 처리됩니다." },
  { level: "info", title: "자동으로 정리돼요", lead: "" },
];

export default async function RemovalPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") notFound();

  const { id } = await params;
  const { data: ph } = await createAdminClient()
    .from("photographers")
    .select("id, display_name, status")
    .eq("id", id)
    .single();
  if (!ph) notFound();

  const report = buildRemovalReport(await fetchRemovalFacts(id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 font-kr">
      <Link href="/admin/photographers" className="text-caption text-muted hover:underline">
        ← 작가 목록
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-xl font-bold tracking-tight">{ph.display_name ?? "이름 없음"}</h1>
        <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-caption text-muted">
          {ph.status === "suspended" ? "정지됨 · 고객에게 안 보여요" : ph.status}
        </span>
      </header>

      <p className="mt-2 text-sm text-muted">
        퇴출은 <b className="text-fg">되돌릴 수 없어요.</b> 작가 등록이 사라지고 사진·패키지·대화·후기가
        함께 지워집니다. 노출만 끊으려면 정지 상태로 두세요.
      </p>

      {SECTIONS.map(({ level, title, lead }) => {
        const items = report.items.filter((i) => i.level === level);
        if (items.length === 0) return null;
        const tone = TONE[level];
        return (
          <section key={level} className="mt-6">
            <h2 className="text-sm font-semibold">
              {tone.mark} {title}{" "}
              <span className="font-normal text-faint">({items.length})</span>
            </h2>
            {lead && <p className="mt-0.5 text-caption text-faint">{lead}</p>}
            <ul className="mt-2 space-y-2">
              {items.map((item) => (
                <li key={item.key} className={`rounded-xl border p-3 ${tone.box}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.count > 0 && (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption ${tone.badge}`}>
                        {item.count}건
                      </span>
                    )}
                  </div>
                  {item.detail && item.detail.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-caption text-muted">
                      {item.detail.map((d) => (
                        <li key={d}>· {d}</li>
                      ))}
                    </ul>
                  )}
                  {item.howTo && <p className="mt-1.5 text-caption text-faint">{item.howTo}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        {/* 되돌리기 — 아직 아무것도 안 지워졌으므로 승인 상태로 복귀하면 끝이다
            (approvePhotographer 가 restore_photographer_content 까지 부른다) */}
        <form action={approvePhotographer}>
          <input type="hidden" name="id" value={id} />
          <PendingButton size="sm" variant="ghost">
            되돌리기 (정지 해제)
          </PendingButton>
        </form>

        {report.canRemove ? (
          <form action={removePhotographer}>
            <input type="hidden" name="id" value={id} />
            <PendingButton size="sm" variant="danger">
              퇴출 실행
            </PendingButton>
          </form>
        ) : (
          <span className="rounded-full border border-line px-3 py-1.5 text-caption text-faint">
            퇴출 불가 — 위 {report.blockers.length}개를 먼저 해소해주세요
          </span>
        )}
      </div>
    </div>
  );
}
