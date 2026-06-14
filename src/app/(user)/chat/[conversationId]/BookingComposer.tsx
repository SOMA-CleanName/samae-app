"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { proposeBooking, updateBooking } from "@/app/actions/bookings";
import { availableStartTimes, type AvailRule, type TimeRange } from "@/lib/slots";
import { CarIcon, XIcon } from "@/components/user/icons";
import { DateWheel } from "./DateWheel";

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
  travelFeeNote: string | null;
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
  const {
    conversationId,
    photographerId,
    packages,
    rules,
    blocks,
    busy,
    bookingNote,
    travelFeeKrw,
    travelFeeNote,
  } = data;
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

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
      onClick={onClose}
    >
      <form
        action={isEdit ? updateBooking : proposeBooking}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-title font-semibold">{isEdit ? "예약 제안 수정" : "예약 제안"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {isEdit && <input type="hidden" name="id" value={editTarget!.id} />}
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="photographerId" value={photographerId} />

        {bookingNote && (
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-fg/[0.05] p-3 text-body-sm text-muted">
            {bookingNote}
          </p>
        )}

        {packages.length === 0 ? (
          <p className="mt-4 text-body-sm text-muted">
            작가가 아직 패키지를 등록하지 않았어요. 채팅으로 문의해 주세요.
          </p>
        ) : (
          // 일관된 세로 리듬 — 섹션 간 space-y-5, 섹션 내부 헤딩 mb-2 + 옵션 space-y-2
          <div className="mt-5 space-y-5">
            {/* 패키지 */}
            <fieldset>
              <legend className="mb-2 text-body-sm font-medium text-fg">패키지</legend>
              <div className="space-y-2">
                {packages.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 transition-colors has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]"
                  >
                    <input
                      type="radio"
                      name="packageId"
                      value={p.id}
                      checked={packageId === p.id}
                      onChange={() => setPackageId(p.id)}
                      required
                      className="h-4 w-4 shrink-0 accent-fg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium text-fg">{p.name}</span>
                      <span className="mt-0.5 block text-caption text-faint">{p.duration_min}분</span>
                    </span>
                    <span className="shrink-0 text-body-sm font-semibold text-fg">
                      ₩{fmt.format(p.price_krw)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* 날짜 — 커스텀 휠 피커(년/월/일) */}
            <div>
              <p className="mb-2 text-body-sm font-medium text-fg">희망 날짜</p>
              <DateWheel
                value={date}
                onChange={(v) => {
                  if (v === date) return;
                  setDate(v);
                  setShootAt(""); // 날짜 바뀌면 시간 초기화
                }}
              />
            </div>

            {/* 빈 시간 */}
            <fieldset>
              <legend className="mb-2 text-body-sm font-medium text-fg">시간</legend>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]">
                  <input
                    type="radio"
                    name="shootAt"
                    value=""
                    checked={shootAt === ""}
                    onChange={() => setShootAt("")}
                    className="h-4 w-4 shrink-0 accent-fg"
                  />
                  <span>날짜·시간 미정 — 채팅으로 협의</span>
                </label>
                {/* 수정 모드: 기존 선택 시각이 목록에 없으면 그대로 노출 */}
                {isEdit && shootAt && !times.includes(shootAt) && (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]">
                    <input type="radio" name="shootAt" value={shootAt} checked readOnly className="h-4 w-4 shrink-0 accent-fg" />
                    <span>{timeLabel(shootAt)} (기존 선택)</span>
                  </label>
                )}
                {date && times.length === 0 && (
                  <p className="px-0.5 text-caption text-faint">그 날은 가능한 시간이 없어요. 다른 날짜를 골라보세요.</p>
                )}
                {times.map((iso) => (
                  <label
                    key={iso}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]"
                  >
                    <input
                      type="radio"
                      name="shootAt"
                      value={iso}
                      checked={shootAt === iso}
                      onChange={() => setShootAt(iso)}
                      className="h-4 w-4 shrink-0 accent-fg"
                    />
                    <span>{timeLabel(iso)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* 출장비 옵션 — 고정 금액(레거시) */}
            {travelFeeKrw > 0 && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]">
                <input
                  type="checkbox"
                  name="travel"
                  defaultChecked={editTarget?.travel ?? false}
                  className="h-4 w-4 shrink-0 rounded accent-fg"
                />
                출장 촬영 (+₩{fmt.format(travelFeeKrw)})
              </label>
            )}

            {/* 출장비 안내 — 자유 텍스트(금액은 협의) */}
            {travelFeeKrw === 0 && travelFeeNote && (
              <div className="rounded-xl border border-line-strong px-3.5 py-3 text-caption text-muted">
                <p className="flex items-center gap-1.5 font-medium text-fg">
                  <CarIcon className="h-4 w-4" />
                  출장비 안내
                </p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{travelFeeNote}</p>
              </div>
            )}

            {/* 장소 */}
            <label className="block">
              <span className="mb-2 block text-body-sm font-medium text-fg">촬영 장소</span>
              <input
                name="locationText"
                defaultValue={editTarget?.locationText ?? ""}
                placeholder="예: 성수동 카페거리"
                className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
              />
            </label>

            {/* 메모 */}
            <label className="block">
              <span className="mb-2 block text-body-sm font-medium text-fg">메모 (선택)</span>
              <textarea
                name="memo"
                rows={2}
                defaultValue={editTarget?.memo ?? ""}
                placeholder="원하는 컨셉·분위기를 적어주세요."
                className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
              />
            </label>

            <ComposerSubmit isEdit={isEdit} />
          </div>
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
      className="mt-1 w-full cursor-pointer rounded-full bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "처리 중…" : isEdit ? "수정하기" : "제안하기"}
    </button>
  );
}
