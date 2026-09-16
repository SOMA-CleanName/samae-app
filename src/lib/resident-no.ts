// 주민등록번호 — **고유식별정보**다. 다른 개인정보와 취급 기준이 다르다.
//
// 개인정보보호법 제24조의2: 주민등록번호는 **법령에 근거가 있을 때만** 처리할 수 있다.
// 우리 근거는 소득세법 제127조(원천징수)와 제164조(지급명세서 제출)다. 사업자 미등록
// 작가에게 정산할 때 3.3%를 원천징수하고 지급명세서를 내야 하는데, 그 서류에 주민번호가
// 들어간다. **근거가 그것뿐이므로 쓰임도 그것뿐이어야 한다.**
//
// 그래서 이 파일이 지키는 것:
//   · 평문을 DB에 두지 않는다 — AES-256-GCM 으로 암호화해 넣는다 (같은 법 제24조 제3항)
//   · 화면·목록·로그에는 **마스킹된 값만** 쓴다 (001010-3******)
//   · 복호화는 지급명세서를 만들 때만, 그리고 **누가 언제 왜 열었는지 남긴다**
//   · 사업자로 전환하면 근거가 사라지므로 **지운다** (제21조 파기 의무)
//
// ⚠️ 사업자 등록을 한 작가(일반·간이과세자)에게는 **받지 않는다.** 세금계산서로 처리되어
//    원천징수 대상이 아니고, 근거 없는 수집이 된다.
//
// ⚠️ **`server-only` 를 붙이지 않았다** — 붙이면 node:test 가 이 파일을 못 읽어서 검증
//    로직에 테스트를 못 단다(같은 이유로 refund·kakao-phone 도 안 붙어 있다). 대신
//    `RESIDENT_NO_KEY` 는 NEXT_PUBLIC_ 이 아니라서 **클라이언트 번들엔 값이 안 실린다.**
//    키 없이 호출하면 던지므로, 실수로 클라이언트에서 부르면 조용히 통과하지 않고 터진다.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** 13자리 숫자만 남긴다 */
function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

export type ResidentNoCheck =
  | { ok: true; digits: string; masked: string; birthDate: string }
  | { ok: false; error: string };

/**
 * 형식·검증번호·생년월일 정합성을 한 번에 본다.
 *
 * 검증번호만 보면 "생년월일이 말이 안 되는데 체크섬은 맞는" 값이 통과한다(예: 13월 45일).
 * 지급명세서에 그대로 들어가면 국세청에서 반려되고, 그때는 작가에게 다시 물어야 한다.
 */
export function checkResidentNo(raw: string): ResidentNoCheck {
  const d = digitsOf(raw);
  if (d.length !== 13) return { ok: false, error: "주민등록번호 13자리를 입력해주세요." };

  // 뒤 첫 자리(성별·세기) — 1·2 1900년대 내국인, 3·4 2000년대 내국인, 5~8 외국인
  const g = Number(d[6]);
  if (g < 1 || g > 8) return { ok: false, error: "주민등록번호를 다시 확인해주세요." };
  const century = g === 1 || g === 2 || g === 5 || g === 6 ? 1900 : 2000;

  const year = century + Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  const dt = new Date(Date.UTC(year, month - 1, day));
  const realDate =
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  if (!realDate) return { ok: false, error: "생년월일이 올바르지 않아요. 다시 확인해주세요." };

  // 검증번호 — 가중치 [2..9,2..5] 합의 11 보수
  const W = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const sum = W.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
  if ((11 - (sum % 11)) % 10 !== Number(d[12])) {
    return { ok: false, error: "주민등록번호를 다시 확인해주세요." };
  }

  return {
    ok: true,
    digits: d,
    masked: maskResidentNo(d),
    birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** 화면·목록·로그에 쓰는 형태. 뒤 6자리는 **절대 남기지 않는다** */
export function maskResidentNo(raw: string): string {
  const d = digitsOf(raw);
  if (d.length !== 13) return "******-*******";
  return `${d.slice(0, 6)}-${d[6]}******`;
}

/**
 * 암호화 키 — 32바이트를 base64 로 `RESIDENT_NO_KEY` 에 둔다.
 *
 * ⚠️ 키가 없으면 **던진다.** 없을 때 평문으로 저장하도록 두면, 키를 안 넣은 환경에서
 *    조용히 평문이 쌓인다. 그건 법 위반이고 나중에 되돌릴 방법도 없다.
 */
function key(): Buffer {
  const raw = process.env.RESIDENT_NO_KEY;
  if (!raw) throw new Error("RESIDENT_NO_KEY 가 설정되지 않았습니다.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("RESIDENT_NO_KEY 는 32바이트(base64) 여야 합니다.");
  return buf;
}

/** 키가 있는가 — 주민번호 수집을 열지 말지 판단할 때 쓴다(던지지 않는다) */
export function residentNoKeyReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * AES-256-GCM. 저장 형태: `v1.<iv>.<tag>.<암호문>` (각 base64url).
 *
 * 버전 접두사를 두는 이유 — 키를 교체하거나 알고리즘을 바꿀 때 기존 값을 구분해야 한다.
 * 접두사가 없으면 "이건 옛날 방식인가 새 방식인가" 를 값만 보고는 알 수 없다.
 */
export function encryptResidentNo(digits: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(digits, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/** 지급명세서를 만들 때만 부른다. 호출부는 접근 로그를 남길 것 */
export function decryptResidentNo(stored: string): string {
  const [v, ivB64, tagB64, dataB64] = stored.split(".");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("주민등록번호 형식이 올바르지 않습니다.");
  }
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
  d.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dataB64, "base64url")), d.final()]).toString("utf8");
}
