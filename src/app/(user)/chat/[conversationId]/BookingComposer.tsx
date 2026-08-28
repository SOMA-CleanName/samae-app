"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { proposeBooking, updateBooking } from "@/app/actions/bookings";
import { availableStartTimes, type AvailRule, type TimeRange } from "@/lib/slots";
import { XIcon } from "@/components/user/icons";
import { DateCalendar } from "./DateCalendar";
import { fieldInputName, type BookingField } from "@/lib/booking-fields";

type Pkg = { id: string; name: string; price_krw: number; duration_min: number };

// 수정 모드 프리필 값 (없으면 신규 제안)
export type BookingEditTarget = {
  id: string;
  packageId: string | null;
  shootAt: string | null;
  shootDate: string | null; // 시간 미정·날짜만 확정된 제안
  locationText: string | null;
  memo: string | null;
  travel?: boolean; // (레거시) 출장 체크박스 — 금액 분리 입력으로 대체됨
  amountKrw?: number | null; // 기존 제안 합계 (촬영비 프리필 = 합계 − 출장비)
  travelFeeKrw?: number | null;
};

// 신규 제안 프리필 — 문의 요약 카드("이 내용으로 예약 제안") 와
// 취소된 예약 다시 쓰기("취소된 카드를 누르면 그 내용 그대로 열린다") 가 함께 쓴다.
// 수정(editTarget)과 달리 **새 제안**이다 — 취소된 예약은 되살릴 수 없으므로 내용만 물려받는다.
export type BookingDraft = {
  packageId?: string | null;
  date?: string | null; // YYYY-MM-DD (지난 날짜는 넘기지 않는다 — 달력이 못 고른다)
  time?: string | null; // HH:MM (30분 격자에 없으면 무시)
  locationText?: string | null;
  memo?: string | null;
  shootFeeKrw?: number | null;
  travelFeeKrw?: number | null;
  /** 작가 정의 항목 값 — fieldId → 값 */
  fieldValues?: Record<string, string>;
};

// 채팅방 예약 작성기에 필요한 데이터 묶음 (페이지에서 주입)
export type ComposerData = {
  conversationId: string;
  photographerId: string;
  packages: Pkg[];
  rules: AvailRule[];
  blocks: TimeRange[];
  busy: TimeRange[];
  travelFeeKrw: number;
  /** 작가가 정의한 예약서 추가 항목 */
  bookingFields: BookingField[];
};

const fmt = new Intl.NumberFormat("ko-KR");

// 직접 선택용 시간 옵션 — 07:00 ~ 22:30, 30분 간격
const TIME_OPTIONS = Array.from({ length: (23 - 7) * 2 }, (_, i) => {
  const h = 7 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

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
  draft,
  onClose,
}: {
  data: ComposerData;
  editTarget?: BookingEditTarget | null;
  draft?: BookingDraft | null; // 신규 제안 프리필 (요약 카드 기반)
  onClose: () => void;
}) {
  const {
    conversationId,
    photographerId,
    packages,
    rules,
    blocks,
    busy,
    travelFeeKrw,
    bookingFields,
  } = data;
  const isEdit = !!editTarget;

  // 프리필 패키지가 그 사이 사라졌을 수 있다 — 없으면 첫 패키지로 내려앉는다
  const prefillPkgId = editTarget?.packageId ?? draft?.packageId ?? null;
  const [packageId, setPackageId] = useState(
    (prefillPkgId && packages.some((p) => p.id === prefillPkgId) ? prefillPkgId : packages[0]?.id) ??
      ""
  );
  const [date, setDate] = useState(
    editTarget
      ? editTarget.shootDate ?? localDate(editTarget.shootAt)
      : draft?.date ?? ""
  );
  // 시간 선택 — "custom" = 직접 선택 / 그 외 = 빈 시간 슬롯 ISO.
  // 미정 옵션은 없앴다: 시간이 안 정해진 제안은 결국 채팅으로 다시 조율하게 돼서 제안의 의미가 없다.
  const [timeSel, setTimeSel] = useState<string>(editTarget?.shootAt ? editTarget.shootAt : "custom");
  const [customTime, setCustomTime] = useState(
    draft?.time && TIME_OPTIONS.includes(draft.time) ? draft.time : "14:00"
  ); // HH:MM (직접 선택)

  const selectedPkg = packages.find((p) => p.id === packageId) ?? packages[0];

  // 협의된 최종 금액 — 촬영비는 선택한 패키지 가격에서 출발하되 자유롭게 수정, 출장비는 별도.
  // 문자열로 들고 있어야 비워두고 다시 입력하는 조작이 자연스럽다(빈 값 = 0).
  const initialTravel =
    editTarget?.travelFeeKrw ?? draft?.travelFeeKrw ?? (editTarget?.travel ? travelFeeKrw : 0);
  const [shootFee, setShootFee] = useState(() => {
    if (editTarget?.amountKrw != null)
      return String(Math.max(0, editTarget.amountKrw - (initialTravel ?? 0)));
    if (draft?.shootFeeKrw != null) return String(Math.max(0, draft.shootFeeKrw));
    return String(packages.find((p) => p.id === packageId)?.price_krw ?? 0);
  });
  const [travelFee, setTravelFee] = useState(String(initialTravel ?? 0));
  const total = (Number(shootFee) || 0) + (Number(travelFee) || 0);

  // 총 촬영비가 패키지 기본가에서 얼마나 벗어났는지 — 협의 결과를 눈으로 확인하고 제안한다.
  // (오타로 0 하나 더 붙는 사고가 여기서 걸린다)
  const basePrice = selectedPkg?.price_krw ?? 0;
  const extraFee = (Number(shootFee) || 0) - basePrice;

  // 선택한 날짜·패키지 기준 빈 시작시간
  const times = useMemo(() => {
    if (!date || !selectedPkg) return [];
    return availableStartTimes(date, selectedPkg.duration_min, rules, blocks, busy);
  }, [date, selectedPkg, rules, blocks, busy]);

  // 최종 제출 시각(ISO) — 슬롯 선택은 그대로, 직접 선택은 날짜+시간 조합, 미정은 빈 값
  const shootAt = useMemo(() => {
    if (timeSel === "custom") {
      if (!date) return "";
      const d = new Date(`${date}T${customTime}:00`);
      return isNaN(d.getTime()) ? "" : d.toISOString();
    }
    return timeSel;
  }, [timeSel, customTime, date]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 font-kr"
      onClick={onClose}
    >
      <form
        action={isEdit ? updateBooking : proposeBooking}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88svh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-title font-semibold">{isEdit ? "예약서 수정" : "예약서 작성"}</h3>
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
        {/* 시각(ISO)·날짜(YYYY-MM-DD) — 시간 미정이어도 날짜는 제안에 담긴다 */}
        <input type="hidden" name="shootAt" value={shootAt} />
        <input type="hidden" name="shootDate" value={date} />

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
                      onChange={() => {
                        setPackageId(p.id);
                        setShootFee(String(p.price_krw)); // 패키지를 바꾸면 촬영비 프리필도 따라간다
                      }}
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
              <DateCalendar
                value={date}
                onChange={(v) => {
                  if (v === date) return;
                  setDate(v);
                  // 날짜가 바뀌면 그 날짜의 슬롯 선택은 무효 — 직접 선택은 유지
                  setTimeSel((cur) => (cur === "custom" ? cur : "custom"));
                }}
              />
            </div>

            {/* 시간 — 직접 선택 / 작가 빈 시간 슬롯 (미정 없음) */}
            <fieldset>
              <legend className="mb-2 text-body-sm font-medium text-fg">시간</legend>
              <div className="space-y-2">
                {/* 직접 선택 — 작가 빈 시간과 무관하게 자유 지정 */}
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]">
                  <input
                    type="radio"
                    checked={timeSel === "custom"}
                    onChange={() => setTimeSel("custom")}
                    className="h-4 w-4 shrink-0 accent-fg"
                  />
                  <span className="shrink-0">시간 선택</span>
                  <select
                    value={customTime}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setCustomTime(e.target.value);
                      setTimeSel("custom");
                    }}
                    className="ml-auto cursor-pointer rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-body-sm tabular-nums outline-none transition-colors focus:border-fg/40"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                {/* 수정 모드: 기존 선택 시각이 목록에 없으면 그대로 노출 */}
                {isEdit && editTarget?.shootAt && !times.includes(editTarget.shootAt) && (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]">
                    <input
                      type="radio"
                      checked={timeSel === editTarget.shootAt}
                      onChange={() => setTimeSel(editTarget.shootAt!)}
                      className="h-4 w-4 shrink-0 accent-fg"
                    />
                    <span>{timeLabel(editTarget.shootAt)} (기존 선택)</span>
                  </label>
                )}

                {/* 작가 빈 시간 슬롯 — 등록된 경우에만 빠른 선택으로 노출 */}
                {times.length > 0 && (
                  <div className="pt-1">
                    <p className="mb-1.5 px-0.5 text-caption text-faint">작가의 빈 시간에서 고르기</p>
                    <div className="flex flex-wrap gap-1.5">
                      {times.map((iso) => (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setTimeSel(iso)}
                          className={`cursor-pointer rounded-full border px-3 py-1.5 text-caption tabular-nums transition-colors ${
                            timeSel === iso
                              ? "border-fg bg-fg text-bg"
                              : "border-line-strong text-fg hover:bg-fg/[0.04]"
                          }`}
                        >
                          {timeLabel(iso)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </fieldset>

            {/* 금액 — 협의된 촬영비와 (있으면) 출장비를 각각 기입. 합계가 곧 입금액이다. */}
            <fieldset>
              <legend className="mb-2 text-body-sm font-medium text-fg">금액</legend>
              <div className="space-y-2">
                <FeeInput
                  label="총 촬영비"
                  name="shootFeeKrw"
                  value={shootFee}
                  onChange={setShootFee}
                  placeholder="0"
                />
                {/* 패키지 기본가 대비 차이 — 협의로 얼마를 더/덜 받는지 바로 보인다 */}
                <p className="px-0.5 text-caption text-faint">
                  {selectedPkg?.name} 기본 ₩{fmt.format(basePrice)}
                  {extraFee > 0 && (
                    <span className="ml-1 font-medium text-brand">
                      · 추가 촬영비 ₩{fmt.format(extraFee)}
                    </span>
                  )}
                  {extraFee < 0 && (
                    <span className="ml-1 font-medium text-warning">
                      · 기본가보다 ₩{fmt.format(-extraFee)} 낮음
                    </span>
                  )}
                  {extraFee === 0 && <span className="ml-1">· 추가 촬영비 없음</span>}
                </p>
                <FeeInput
                  label="출장비"
                  name="travelFeeKrw"
                  value={travelFee}
                  onChange={setTravelFee}
                  placeholder="없으면 비워두세요"
                />
                <div className="flex items-center justify-between rounded-xl bg-fg/[0.05] px-3.5 py-3">
                  <span className="text-body-sm font-medium text-fg">합계</span>
                  <span className="text-body font-bold text-fg">₩{fmt.format(total)}</span>
                </div>
                <p className="px-0.5 text-caption text-faint">
                  합계 금액을 사매 계좌로 입금받아요.
                </p>
              </div>
            </fieldset>

            {/* 장소 */}
            <label className="block">
              <span className="mb-2 block text-body-sm font-medium text-fg">촬영 장소</span>
              <input
                name="locationText"
                required
                defaultValue={editTarget?.locationText ?? draft?.locationText ?? ""}
                placeholder="예: 성수동 카페거리"
                className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
              />
            </label>

            {/* 작가가 정의한 추가 항목 — 촬영 전에 꼭 확인해야 하는 것들 */}
            {bookingFields.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-body-sm font-medium text-fg">촬영 정보</legend>
                <div className="space-y-2">
                  {bookingFields.map((f) => (
                    <CustomField key={f.id} field={f} initial={draft?.fieldValues?.[f.id]} />
                  ))}
                </div>
              </fieldset>
            )}

            {/* 메모 */}
            <label className="block">
              <span className="mb-2 block text-body-sm font-medium text-fg">메모 (선택)</span>
              <textarea
                name="memo"
                rows={2}
                defaultValue={editTarget?.memo ?? draft?.memo ?? ""}
                placeholder="원하는 컨셉·분위기를 적어주세요."
                className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
              />
            </label>

            <ComposerSubmit isEdit={isEdit} blocked={!date || !shootAt} />
          </div>
        )}
      </form>
    </div>
  );
}

// 작가 정의 항목 한 칸 — 타입에 따라 입력·선택·체크박스
function CustomField({ field, initial }: { field: BookingField; initial?: string }) {
  const name = fieldInputName(field.id);
  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 text-body-sm has-[:checked]:border-fg has-[:checked]:bg-fg/[0.03]">
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={initial === "예"}
          className="h-4 w-4 shrink-0 accent-fg"
        />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="mb-1.5 block text-caption text-muted">
          {field.label}
          {field.required && <span className="ml-1 text-danger">*</span>}
        </span>
        <select
          name={name}
          required={field.required}
          defaultValue={initial && (field.options ?? []).includes(initial) ? initial : ""}
          className="w-full cursor-pointer rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
        >
          <option value="" disabled>
            선택해주세요
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block">
      <span className="mb-1.5 block text-caption text-muted">
        {field.label}
        {field.required && <span className="ml-1 text-danger">*</span>}
      </span>
      <input
        name={name}
        required={field.required}
        defaultValue={initial ?? ""}
        className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-body-sm outline-none transition-colors focus:border-fg/40"
      />
    </label>
  );
}

// 금액 입력 — 숫자만 허용(서버가 다시 검증한다). inputMode=numeric 으로 모바일 숫자 키패드.
function FeeInput({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line-strong px-3.5 py-3 focus-within:border-fg/40">
      <span className="shrink-0 text-body-sm text-fg">{label}</span>
      <span className="ml-auto flex items-center gap-1">
        <span className="text-body-sm text-faint">₩</span>
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder={placeholder}
          className="w-32 bg-transparent text-right text-body-sm tabular-nums outline-none placeholder:text-faint"
        />
      </span>
    </label>
  );
}

// 제출 버튼 — 전송 중 비활성화로 연속 클릭 중복 제안 방지
function ComposerSubmit({ isEdit, blocked }: { isEdit: boolean; blocked?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <>
      {blocked && (
        <p className="text-caption text-faint">희망 날짜와 시간을 골라야 제안할 수 있어요.</p>
      )}
    <button
      type="submit"
      disabled={pending || blocked}
      className="mt-1 w-full cursor-pointer rounded-full bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "처리 중…" : isEdit ? "수정하기" : "제안하기"}
    </button>
    </>
  );
}
