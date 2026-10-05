// 비용 가드 — 여기가 틀리면 상한이 엉뚱한 시각에 풀리거나 영영 안 풀린다.
//   npx tsx --test src/lib/persona/cost-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyCap, analysisOff, kstMidnightUtc } from "./cost-guard.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("상한은 숫자일 때만 켜진다 — 오타로 서비스가 막히면 안 된다", () => {
  withEnv({ PERSONA_DAILY_CAP: "300" }, () => assert.equal(dailyCap(), 300));
  withEnv({ PERSONA_DAILY_CAP: "" }, () => assert.equal(dailyCap(), 0));
  withEnv({ PERSONA_DAILY_CAP: undefined }, () => assert.equal(dailyCap(), 0));
  withEnv({ PERSONA_DAILY_CAP: "삼백" }, () => assert.equal(dailyCap(), 0));
  withEnv({ PERSONA_DAILY_CAP: "0" }, () => assert.equal(dailyCap(), 0));
  withEnv({ PERSONA_DAILY_CAP: "-5" }, () => assert.equal(dailyCap(), 0));
});

test("끄기 스위치는 정확히 '1' 일 때만 — true/yes 로 착각해 켠 줄 알면 안 된다", () => {
  withEnv({ PERSONA_ANALYSIS_OFF: "1" }, () => assert.equal(analysisOff(), true));
  withEnv({ PERSONA_ANALYSIS_OFF: "0" }, () => assert.equal(analysisOff(), false));
  withEnv({ PERSONA_ANALYSIS_OFF: "true" }, () => assert.equal(analysisOff(), false));
  withEnv({ PERSONA_ANALYSIS_OFF: undefined }, () => assert.equal(analysisOff(), false));
});

test("하루 경계는 한국 자정이다 — 서버 UTC 로 끊으면 오전 9시에 풀린다", () => {
  const iso = kstMidnightUtc();
  const d = new Date(iso);
  // KST 자정 = UTC 15:00 (전날)
  assert.equal(d.getUTCHours(), 15, `UTC 15시가 아니다: ${iso}`);
  assert.equal(d.getUTCMinutes(), 0);
  assert.equal(d.getUTCSeconds(), 0);
});

test("경계는 지금보다 과거이고 24시간을 넘지 않는다", () => {
  const ms = Date.parse(kstMidnightUtc());
  const now = Date.now();
  assert.ok(ms <= now, "자정이 미래다");
  assert.ok(now - ms < 86_400_000, "자정이 하루보다 멀다 — 날짜 계산이 밀렸다");
});
