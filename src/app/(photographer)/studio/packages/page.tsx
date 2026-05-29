import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createPackage,
  updatePackage,
  deletePackage,
  togglePackageActive,
} from "./actions";

type Pkg = {
  id: string;
  name: string;
  description: string;
  price_krw: number;
  duration_min: number;
  edited_count: number;
  is_active: boolean;
};

const inputCls =
  "rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm outline-none focus:border-fg/40";

// 패키지 관리 — 서버 구동 폼(클라이언트 상태 없음)
export default async function PackagesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/packages");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("id, name, description, price_krw, duration_min, edited_count, is_active")
    .eq("photographer_id", me.photographer.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const packages = (data ?? []) as Pkg[];

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">패키지 관리</h1>
      <p className="mt-1 text-sm text-fg/55">
        촬영 상품을 등록하세요. 활성화된 패키지가 예약 시 선택지로 노출됩니다.
      </p>

      {/* 새 패키지 추가 */}
      <section className="mt-6 rounded-xl border border-fg/15 p-4">
        <h2 className="text-sm font-semibold">새 패키지 추가</h2>
        <form action={createPackage} className="mt-3 grid gap-3">
          <input name="name" placeholder="패키지 이름 (예: 데이트 스냅 베이직)" required className={inputCls} />
          <textarea name="description" rows={2} placeholder="설명 (선택)" className={inputCls} />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput name="priceKrw" label="가격(원)" type="number" required />
            <LabeledInput name="durationMin" label="소요(분)" type="number" defaultValue="60" required />
            <LabeledInput name="editedCount" label="보정본(장)" type="number" defaultValue="10" required />
          </div>
          <button className="justify-self-start rounded-full bg-fg px-5 py-2 text-sm font-semibold text-bg hover:opacity-90">
            추가
          </button>
        </form>
      </section>

      {/* 기존 패키지 목록 */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-fg/70">등록된 패키지 {packages.length}</h2>
        {packages.length === 0 ? (
          <p className="mt-3 text-sm text-fg/45">아직 패키지가 없어요.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {packages.map((p) => (
              <li key={p.id} className="rounded-xl border border-fg/10 p-4">
                {/* 수정 폼 (각 행이 곧 폼) */}
                <form action={updatePackage} className="grid gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <input name="name" defaultValue={p.name} required className={inputCls} />
                  <textarea name="description" rows={2} defaultValue={p.description} className={inputCls} />
                  <div className="grid grid-cols-3 gap-2">
                    <LabeledInput name="priceKrw" label="가격(원)" type="number" defaultValue={String(p.price_krw)} required />
                    <LabeledInput name="durationMin" label="소요(분)" type="number" defaultValue={String(p.duration_min)} required />
                    <LabeledInput name="editedCount" label="보정본(장)" type="number" defaultValue={String(p.edited_count)} required />
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-full bg-fg px-4 py-1.5 text-xs font-semibold text-bg hover:opacity-90">
                      저장
                    </button>
                    <StatusPill active={p.is_active} />
                  </div>
                </form>

                {/* 노출 토글 / 삭제 */}
                <div className="mt-2 flex items-center gap-2 border-t border-fg/8 pt-2">
                  <form action={togglePackageActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="isActive" value={String(!p.is_active)} />
                    <button className="rounded-full border border-fg/20 px-3 py-1 text-xs text-fg/70 hover:bg-fg/[0.04]">
                      {p.is_active ? "비활성화" : "활성화"}
                    </button>
                  </form>
                  <form action={deletePackage}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded-full px-3 py-1 text-xs text-brand hover:bg-brand/[0.06]">
                      삭제
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function LabeledInput({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-fg/55">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={type === "number" ? 0 : undefined}
        className="rounded-lg border border-fg/15 bg-white px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
      />
    </label>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] ${
        active ? "bg-emerald-500/15 text-emerald-700" : "bg-fg/10 text-fg/50"
      }`}
    >
      {active ? "노출 중" : "비활성"}
    </span>
  );
}
