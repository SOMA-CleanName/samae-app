import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveBookingTemplate } from "./actions";
import { BookingFieldsEditor } from "./BookingFieldsEditor";
import { normalizeBookingFields } from "@/lib/booking-fields";

// 예약 설정 — 채팅 예약 제안에 쓰일 안내문·출장비 템플릿
export default async function BookingTemplatePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/booking");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data: ph } = await supabase
    .from("photographers")
    .select("booking_fields")
    .eq("id", me.photographer.id)
    .single();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 font-kr sm:px-6">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">예약 설정</h1>
      <p className="mt-1 text-sm text-fg/55">
        예약 제안서에서 고객에게 함께 물어볼 항목을 정할 수 있어요.
      </p>

      <form action={saveBookingTemplate} className="mt-6 flex flex-col gap-5">
        {/* 예약서 추가 항목 — 촬영 전에 꼭 받아야 하는 것을 작가가 직접 정의 */}
        <div className="flex flex-col gap-1 text-sm font-medium">
          예약서 추가 항목
          <span className="mb-1 text-xs font-normal text-fg/45">
            예약 제안서에 이 항목들이 함께 뜨고, 채워진 값은 예약 상세에 그대로 남아요. 최대 5개.
          </span>
          <BookingFieldsEditor initial={normalizeBookingFields(ph?.booking_fields).fields} />
        </div>
      </form>
    </main>
  );
}
