// 알림톡 템플릿 원문 출력 — 솔라피 콘솔에 붙여넣을 때 쓴다.
// 사용: npx tsx scripts/print-alimtalk-templates.ts
// 문안의 진실은 src/lib/notify-templates.ts 하나다. 이 스크립트는 그걸 읽어 보여줄 뿐이다.
import { NOTIFY_KINDS, NOTIFY_TEMPLATES, alimtalkTemplateEnvKey } from "../src/lib/notify-templates";

for (const kind of NOTIFY_KINDS) {
  const t = NOTIFY_TEMPLATES[kind];
  console.log(`## ${t.label}  (${kind} → ${alimtalkTemplateEnvKey(kind)})`);
  console.log(`받는 사람: ${t.recipient} · 변수: ${t.variables.map((v) => `#{${v}}`).join(", ")}`);
  console.log(`버튼: [${t.button.name}] 웹링크 → #{${t.button.urlVariable}}`);
  console.log("```");
  console.log(t.body);
  console.log("```");
  console.log();
}
