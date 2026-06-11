"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { proposeBooking, updateBooking } from "@/app/actions/bookings";
import { availableStartTimes, type AvailRule, type TimeRange } from "@/lib/slots";

type Pkg = { id: string; name: string; price_krw: number; duration_min: number };

// 수정 모드 프리필 값 (없으면 신규 제안)
export type BookingEditTarget = {
  id: string;
  packageId: string | null;
  shootAt: string | null;
  locationText: string | null;
  memo: string | null;
  travel: boolean;
};

// 채팅방 예약 작성기에 필요한 데이터 묶음 (페이지에서 주입)
export type ComposerData = {
  conversationId: string;
  photographerId: string;
  packages: Pkg[];
  rules: AvailRule[];
  blocks: TimeRange[];
  busy: TimeRange[];
  bookingNote: string | null;
  travelFeeKrw: number;
};

const fmt = new Intl.NumberFormat("ko-KR");

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

// shoot_at(ISO) → 로컬 날짜 문자열(YYYY-MM-DD)
function localDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA");
}

// 채팅 예약 작성기 — 신규 제안 / 기존 제안 수정 겸용 (마운트 시 모달 표시)
export function BookingComposer({
  data,
  editTarget,
  onClose,
}: {
  data: ComposerData;
  editTarget?: BookingEditTarget | null;
  onClose: () => void;
}) {
  const { conversationId, photographerId, packages, rules, blocks, busy, bookingNote, travelFeeKrw } =
    data;
  const isEdit = !!editTarget;

  const [packageId, setPackageId] = useState(
    editTarget?.packageId ?? packages[0]?.id ?? ""
  );
  const [date, setDate] = useState(localDate(editTarget?.shootAt ?? null));
  const [shootAt, setShootAt] = useState(editTarget?.shootAt ?? ""); // 선택 시각("" = 협의)

  const selectedPkg = packages.find((p) => p.id === packageId) ?? packages[0];

  // 선택한 날짜·패키지 기준 빈 시작시간
  const times = useMemo(() => {
    if (!date || !selectedPkg) return [];
    return availableStartTimes(date, selectedPkg.duration_min, rules, blocks, busy);
  }, [date, selectedPkg, rules, blocks, busy]);

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD(로컬)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
      onClick={onClose}
    >
      <form
        action={isEdit ? updateBooking : proposeBooking}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{isEdit ? "예약 제안 수정" : "예약 제안"}</h3>
          <button type="button" onClick={onClose} className="text-sm text-fg/50 hover:text-fg">
            닫기
          </button>
        </div>

        {isEdit && <input type="hidden" name="id" value={editTarget!.id} />}
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="photographerId" value={photographerId} />

        {bookingNote && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-fg/[0.05] p-3 text-xs text-fg/70">
            {bookingNote}
          </p>
        )}

        {packages.length === 0 ? (
          <p className="mt-4 text-sm text-fg/60">
            작가가 아직 패키지를 등록하지 않았어요. 채팅으로 문의해 주세요.
          </p>
        ) : (
          <>
            {/* 패키지 */}
            <fieldset className="mt-4 flex flex-col gap-2">
              <legend className="text-sm font-medium">패키지</legend>
              {packages.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-fg/15 px-3 py-2.5 text-sm has-[:checked]:border-fg"
                >
                  <input
                    type="radio"
                    name="packageId"
                    value={p.id}
                    checked={packageId === p.id}
                    onChange={() => setPackageId(p.id)}
                    required
                  />
                  <span className="flex-1">
                    {p.name}
                    <span className="block text-xs text-fg/50">{p.duration_min}분</span>
                  </span>
                  <span className="font-semibold">₩{fmt.format(p.price_krw)}</span>
                </label>
              ))}
            </fieldset>

            {/* 날짜 */}
            <label className="mt-4 flex flex-col gap-1 text-sm font-medium">
              희망 날짜
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setShootAt(""); // 날짜 바뀌면 시간 초기화
                }}
                className="rounded-xl border border-fg/15 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-fg/40"
              />
            </label>

            {/* 빈 시간 */}
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="text-sm font-medium">시간</legend>
              <label className="flex items-center gap-3 rounded-xl border border-fg/15 px-3 py-2.5 text-sm has-[:checked]:border-fg">
                <input
                  type="radio"
                  name="shootAt"
                  value=""
                  checked={shootAt === ""}
                  onChange={() => setShootAt("")}
                />
                <span>날짜·시간 미정 — 채팅으로 협의</span>
              </label>
              {/* 수정 모드: 기존 선택 시각이 목록에 없으면 그대로 노출 */}
              {isEdit && shootAt && !times.includes(shootAt) && (
                <label className="flex items-center gap-3 rounded-xl border border-fg/15 px-3 py-2.5 text-sm has-[:checked]:border-fg">
                  <input type="radio" name="shootAt" value={shootAt} checked readOnly />
                  <span>{timeLabel(shootAt)} (기존 선택)</span>
                </label>
              )}
              {date && times.length === 0 && (
                <p className="px-1 text-xs text-fg/45">그 날은 가능한 시간이 없어요. 다른 날짜를 골라보세요.</p>
              )}
              {times.map((iso) => (
                <label
                  key={iso}
                  className="flex items-center gap-3 rounded-xl border border-fg/15 px-3 py-2.5 text-sm has-[:checked]:border-fg"
                >
                  <input
                    type="radio"
                    name="shootAt"
                    value={iso}
                    checked={shootAt === iso}
                    onChange={() => setShootAt(iso)}
                  />
                  <span>{timeLabel(iso)}</span>
                </label>
              ))}
            </fieldset>

            {/* 출장비 옵션 */}
            {travelFeeKrw > 0 && (
              <label className="mt-4 flex items-center gap-2 rounded-xl border border-fg/15 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  name="travel"
                  defaultChecked={editTarget?.travel ?? false}
                  className="h-4 w-4 rounded border-fg/30"
                />
                출장 촬영 (+₩{fmt.format(travelFeeKrw)})
              </label>
            )}

            {/* 장소 */}
            <label className="mt-4 flex flex-col gap-1 text-sm font-medium">
              촬영 장소
              <input
                name="locationText"
                defaultValue={editTarget?.locationText ?? ""}
                placeholder="예: 성수동 카페거리"
                className="rounded-xl border border-fg/15 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-fg/40"
              />
            </label>

            {/* 메모 */}
            <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
              메모 (선택)
              <textarea
                name="memo"
                rows={2}
                defaultValue={editTarget?.memo ?? ""}
                placeholder="원하는 컨셉·분위기를 적어주세요."
                className="rounded-xl border border-fg/15 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-fg/40"
              />
            </label>

            <ComposerSubmit isEdit={isEdit} />
          </>
        )}
      </form>
    </div>
  );
}

// 제출 버튼 — 전송 중 비활성화로 연속 클릭 중복 제안 방지
function ComposerSubmit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-5 w-full rounded-full bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "처리 중…" : isEdit ? "수정하기" : "제안하기"}
    </button>
  );
}
