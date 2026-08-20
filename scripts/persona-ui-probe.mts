// 헤드리스 크롬 CDP 프로브 — 하이드레이션 **이후** 의 인터랙티브 상태를 검증한다.
//
// --screenshot / --dump-dom 은 load 시점에 찍는다. 디바운스 조회(600ms) + 서버 액션처럼
// 하이드레이션 뒤에 일어나는 UI 는 그 방법으로는 영원히 안 보인다 — 그래서 CDP 로
// 직접 붙어 기다렸다가 DOM 을 묻고 스크린샷을 찍는다. (Node 22+ 네이티브 WebSocket 사용)
//
// 실행: npx tsx scripts/persona-ui-probe.mts <URL> <대기ms> <스크린샷경로> [검사문자열...]

import { spawn } from "node:child_process";
import fs from "node:fs/promises";

const [url, waitMsRaw, shotPath, ...checks] = process.argv.slice(2);
const waitMs = Number(waitMsRaw ?? 6000);
if (!url) {
  console.error("사용법: persona-ui-probe.mts <URL> <대기ms> <스크린샷경로> [검사문자열...]");
  process.exit(1);
}

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222 + Math.floor(Math.random() * 500);

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--window-size=${process.env.PROBE_VIEWPORT ?? "430,932"}`,
  `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/persona-ui-probe-profile",
  "about:blank",
]);
const kill = () => chrome.kill("SIGKILL");
process.on("exit", kill);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 디버거 준비 대기
let target: { webSocketDebuggerUrl: string } | undefined;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    const list = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as Array<{
      type: string;
      webSocketDebuggerUrl: string;
    }>;
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {
    /* 아직 안 뜸 */
  }
}
if (!target) throw new Error("크롬 디버거에 연결 실패");

const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const waiting = new Map<number, (v: unknown) => void>();
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)!(msg.result);
    waiting.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve as (v: unknown) => void);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
// 콘솔·예외 수집
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    const text = (msg.params.args ?? []).map((a: { value?: unknown; description?: string }) => a.value ?? a.description ?? "").join(" ");
    console.log(`🟡 console.${msg.params.type}:`, String(text).slice(0, 300));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    console.log("🔴 exception:", JSON.stringify(msg.params.exceptionDetails).slice(0, 400));
  }
});
await send("Page.navigate", { url });
await sleep(Math.min(waitMs, 5000)); // 하이드레이션 대기

// TYPE=아이디 환경변수가 있으면 실제 타이핑을 시뮬레이션 (프리필 경로와 별개 검증)
const typeText = process.env.PROBE_TYPE;
if (typeText) {
  await send("Runtime.evaluate", { expression: "document.querySelector('#persona-username').focus()" });
  for (const ch of typeText) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
    await send("Input.dispatchKeyEvent", { type: "keyUp" });
    await sleep(40);
  }
  await sleep(waitMs); // 디바운스 + 조회 왕복
}

// PROBE_CLICK 셀렉터가 있으면 클릭 후 PROBE_CLICK_WAIT(ms) 대기 (분석 완료 대기용)
if (process.env.PROBE_CLICK) {
  const sel = process.env.PROBE_CLICK.replace(/'/g, "\\'");
  await send("Runtime.evaluate", { expression: `document.querySelector('${sel}')?.click()` });
  await sleep(Number(process.env.PROBE_CLICK_WAIT ?? 30000));
}

// PROBE_EVAL 표현식이 있으면 평가해 출력 (임의 검사용)
if (process.env.PROBE_EVAL) {
  const ev = (await send("Runtime.evaluate", { expression: process.env.PROBE_EVAL, returnByValue: true })) as { result?: { value?: unknown } };
  console.log("🧪 eval:", JSON.stringify(ev.result?.value));
}

// 하이드레이션 진단 — React 가 input 에 붙었는지(__reactProps), 청크 로딩 상태
const diag = (await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    reactOnInput: Object.keys(document.querySelector('${process.env.PROBE_SEL ?? '#persona-username'}') ?? {}).filter(k => k.startsWith('__react')).length,
    scripts: document.scripts.length,
    pendingChunks: performance.getEntriesByType('resource').filter(r => r.responseEnd === 0).length,
  })`,
  returnByValue: true,
})) as { result?: { value?: string } };
console.log("🔬 진단:", diag.result?.value);

// DOM 텍스트 검사
const evalRes = (await send("Runtime.evaluate", {
  expression: "document.body.innerText",
  returnByValue: true,
})) as { result?: { value?: string } };
const text = evalRes.result?.value ?? "";

for (const c of checks) {
  console.log(`${text.includes(c) ? "✅" : "❌"} "${c}"`);
}

if (shotPath) {
  const shot = (await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true, // 전체 페이지 — 스크롤 밖 섹션까지
  })) as { data?: string };
  if (shot.data) {
    await fs.writeFile(shotPath, Buffer.from(shot.data, "base64"));
    console.log(`📸 ${shotPath}`);
  }
}

ws.close();
kill();
process.exit(0);
