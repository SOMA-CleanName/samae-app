import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveBookingTemplate } from "./actions";

// 예약 설정 — 채팅 예약 제안에 쓰일 안내문·출장비 템플릿
export default async function BookingTemplatePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/booking");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data: ph } = await supabase
    .from("photographers")
    .select("booking_note, travel_fee_krw")
    .eq("id", me.photographer.id)
    .single();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 font-kr sm:px-6">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">예약 설정</h1>
      <p className="mt-1 text-sm text-fg/55">
        고객이 채팅에서 “예약하기”를 누르면 보게 될 안내문과 출장비 옵션이에요.
      </p>

      <form action={saveBookingTemplate} className="mt-6 flex flex-col gap-5">
        {/* 예약 안내문/조건 */}
        <label className="flex flex-col gap-1 text-sm font-medium">
          예약 안내문 · 조건
          <textarea
            name="booking_note"
            rows={5}
            defaultValue={ph?.booking_note ?? ""}
            placeholder={"예) 선입금 후 예약 확정됩니다.\n촬영 3일 전까지 취소 가능, 이후 환불 불가."}
            className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-fg/40"
          />
          <span className="text-xs text-fg/45">고객이 예약 제안 화면 상단에서 보게 됩니다.</span>
        </label>

        {/* 출장비 */}
        <label className="flex flex-col gap-1 text-sm font-medium">
          출장비 (원)
          <input
            name="travel_fee_krw"
            type="number"
            min={0}
            step={1000}
            defaultValue={ph?.travel_fee_krw ? String(ph.travel_fee_krw) : ""}
            placeholder="예: 20000 (없으면 비워두세요)"
            className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-fg/40"
          />
          <span className="text-xs text-fg/45">
            0이거나 비우면 출장비 옵션이 표시되지 않아요. 설정하면 고객이 “출장 촬영”을 선택할 때 금액에 더해집니다.
          </span>
        </label>

        <button className="rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
          저장
        </button>
      </form>
    </main>
  );
}
