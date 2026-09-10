// 예약서 추가 항목 — 작가가 직접 정의하는 입력칸.
//
// 작가마다 촬영 전에 꼭 확인해야 하는 게 다르다(차량·반려동물·의상 벌수·헤어메이크업 …).
// 그걸 메모에 적어달라고 하거나 채팅으로 따로 묻는 대신, 예약서 안에서 받는다.
//
// 순수 로직만 둔다 — 서버(저장·검증)와 클라이언트(작성기 렌더)가 같은 규칙을 쓴다.

export const MAX_BOOKING_FIELDS = 5;
export const MAX_FIELD_LABEL = 60;
export const MAX_FIELD_OPTIONS = 6;
export const MAX_FIELD_VALUE = 200;

export type BookingFieldType = "text" | "select" | "checkbox";

/** 작가가 정의한 항목 스펙 (photographers.booking_fields) */
export type BookingField = {
  id: string;
  label: string;
  type: BookingFieldType;
  /** select 일 때만 */
  options?: string[];
  required?: boolean;
};

/** 그 예약에서 채워진 값 (bookings.custom_fields) — 라벨을 함께 굳힌다 */
export type BookingFieldValue = {
  id: string;
  label: string;
  value: string;
};

const TYPES = new Set<BookingFieldType>(["text", "select", "checkbox"]);

/**
 * 저장 전 정규화.
 *
 * ⚠️ 서버는 이 결과로 **던지지 않는다.** 사용자에게 알려줄 자리는 편집 화면이고,
 * 서버가 throw 하면 설정 페이지 전체가 런타임 에러로 죽는다(빈 항목 하나 때문에).
 * 그래서 규칙에 안 맞는 항목은 여기서 조용히 버리고, errors 는 편집기가 인라인으로 보여주는 용도로만 쓴다.
 */
export function normalizeBookingFields(raw: unknown): {
  fields: BookingField[];
  errors: string[];
} {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { fields: [], errors: [] };

  const fields: BookingField[] = [];
  const seen = new Set<string>();

  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, MAX_FIELD_LABEL) : "";
    // 추가만 해두고 안 채운 줄 — 오류로 막지 않고 버린다 (편집기가 미리 알려준다)
    if (!label) return;
    const type: BookingFieldType = TYPES.has(r.type as BookingFieldType)
      ? (r.type as BookingFieldType)
      : "text";

    // id 는 값 스냅샷과 짝을 이루는 키 — 없으면 만들고, 겹치면 뒤엣것을 밀어낸다
    let id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 20) : `f${i + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);

    let options: string[] | undefined;
    if (type === "select") {
      options = Array.isArray(r.options)
        ? r.options
            .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
            .map((o) => o.trim().slice(0, 40))
            .slice(0, MAX_FIELD_OPTIONS)
        : [];
      if (options.length < 2) {
        errors.push(`"${label}": 선택 항목은 보기가 2개 이상이어야 해요.`);
        return;
      }
    }

    fields.push({
      id,
      label,
      type,
      ...(options ? { options } : {}),
      ...(r.required ? { required: true } : {}),
    });
  });

  if (fields.length > MAX_BOOKING_FIELDS) {
    errors.push(`항목은 최대 ${MAX_BOOKING_FIELDS}개까지예요 (현재 ${fields.length}개).`);
    return { fields: fields.slice(0, MAX_BOOKING_FIELDS), errors };
  }
  return { fields, errors };
}

/** 폼 필드명 — 작성기 input name 과 서버 파싱이 같은 규칙을 써야 한다 */
export const fieldInputName = (id: string) => `cf_${id}`;

/**
 * 제출된 FormData → 값 스냅샷.
 * 필수인데 비었으면 errors 에 담는다 (서버가 최종 판정 — 클라이언트 required 는 우회 가능).
 */
export function readBookingFieldValues(
  fields: BookingField[],
  get: (name: string) => string | null
): { values: BookingFieldValue[]; errors: string[] } {
  const values: BookingFieldValue[] = [];
  const errors: string[] = [];

  for (const f of fields) {
    const raw = (get(fieldInputName(f.id)) ?? "").trim().slice(0, MAX_FIELD_VALUE);
    const value = f.type === "checkbox" ? (raw ? "예" : "아니오") : raw;

    if (f.required && f.type !== "checkbox" && !value) {
      errors.push(`"${f.label}" 을(를) 입력해주세요.`);
      continue;
    }
    // 선택 항목은 정의된 보기 중 하나여야 한다 (임의 값 주입 차단)
    if (f.type === "select" && value && !(f.options ?? []).includes(value)) {
      errors.push(`"${f.label}" 의 값이 올바르지 않아요.`);
      continue;
    }
    if (!value && f.type !== "checkbox") continue; // 선택 항목은 비어도 됨 → 스냅샷에서 제외
    values.push({ id: f.id, label: f.label, value });
  }
  return { values, errors };
}

/** 저장된 값 스냅샷 읽기 (표시용) — 형식이 깨져 있어도 화면이 죽지 않게 */
export function readStoredFieldValues(raw: unknown): BookingFieldValue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: String(r.id ?? ""),
      label: String(r.label ?? ""),
      value: String(r.value ?? ""),
    }))
    .filter((v) => v.label && v.value);
}
