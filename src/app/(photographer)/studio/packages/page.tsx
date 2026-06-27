import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPackage } from "./actions";
import { PackageItem, type Pkg } from "./PackageItem";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls =
  "rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm outline-none focus:border-fg/40";

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
            <LabeledInput name="priceKrw" label="가격(원)" defaultValue="100000" min={0} max={100_000_000} step={10_000} required />
            <LabeledInput name="durationMin" label="소요(분)" defaultValue="60" min={10} max={1440} step={5} required />
            <LabeledInput name="editedCount" label="보정본(장)" defaultValue="10" min={0} max={1000} step={1} required />
          </div>
          <SubmitButton pendingText="추가 중…" className="justify-self-start rounded-full bg-fg px-5 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50">
            추가
          </SubmitButton>
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
              <PackageItem key={p.id} p={p} />
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
  defaultValue,
  min,
  max,
  step,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-fg/55">
      {label}
      <input
        name={name}
        type="number"
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
        step={step}
        className="rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg/40"
      />
    </label>
  );
}
