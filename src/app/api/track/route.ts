import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 행동 분석 수집 — DB 적재(전부) + 핵심 이벤트만 Google Sheets webhook 으로 forward.
// service-role insert(테이블 anon 쓰기 미허용). 로그인 시 profile_id 첨부.

const SHEETS_URL = process.env.SHEETS_WEBHOOK_URL;

// 시트로 보낼 '핵심 이벤트' 판별: 페이지뷰 + data-track="cta:..." 로 표시된 클릭
function isKeyEvent(type: string, label: string | null): boolean {
  return type === "pageview" || (!!label && label.startsWith("cta:"));
}

// 운영자·작가 페이지는 고객 행동이 아니므로 제외 (클라 가드 보조)
function isCustomerPath(path: string): boolean {
  return !/^\/(admin|studio)(\/|$)/.test(path);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const b = body as {
    sessionId?: unknown;
    utm?: Record<string, unknown>;
    landingPath?: unknown;
    events?: unknown;
  };
  const sessionId = String(b.sessionId ?? "").slice(0, 64);
  const events = Array.isArray(b.events) ? b.events.slice(0, 30) : [];
  if (!sessionId || events.length === 0) return new NextResponse(null, { status: 204 });

  const str = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
  const utm = (b.utm ?? {}) as Record<string, unknown>;
  const utmCols = {
    utm_source: str(utm.utm_source, 200),
    utm_medium: str(utm.utm_medium, 200),
    utm_campaign: str(utm.utm_campaign, 200),
    utm_content: str(utm.utm_content, 200),
    utm_term: str(utm.utm_term, 200),
  };
  const landingPath = str(b.landingPath, 300);

  // 첨부용 — 쿠키 기반(가볍게)
  let profileId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    profileId = data.session?.user?.id ?? null;
  } catch {
    profileId = null;
  }

  const norm = events.map((e) => {
    const ev = e as Record<string, unknown>;
    return {
      type: ev.type === "click" ? "click" : "pageview",
      path: str(ev.path, 300) ?? "",
      label: str(ev.label, 200),
      target: str(ev.target, 300),
      referrer: str(ev.referrer, 300),
    };
  });

  const rows = norm
    .filter((r) => r.path && isCustomerPath(r.path))
    .map((r) => ({
      session_id: sessionId,
      profile_id: profileId,
      type: r.type,
      path: r.path,
      label: r.label,
      target: r.target,
      referrer: r.referrer,
      landing_path: landingPath,
      ...utmCols,
    }));

  if (rows.length > 0) {
    const admin = createAdminClient();
    await admin.from("analytics_events").insert(rows);
  }

  // 핵심 이벤트만 시트로 forward (설정돼 있을 때만)
  if (SHEETS_URL) {
    const ts = new Date().toISOString();
    const sheetRows = norm
      .filter((r) => r.path && isCustomerPath(r.path) && isKeyEvent(r.type, r.label))
      .map((r) => ({
        ts,
        event: r.type,
        path: r.path,
        label: r.label ?? "",
        target: r.target ?? "",
        referrer: r.referrer ?? "",
        landing_path: landingPath ?? "",
        utm_source: utmCols.utm_source ?? "direct",
        utm_medium: utmCols.utm_medium ?? "",
        utm_campaign: utmCols.utm_campaign ?? "",
        utm_content: utmCols.utm_content ?? "",
        utm_term: utmCols.utm_term ?? "",
        session_id: sessionId,
        profile_id: profileId ?? "",
      }));
    if (sheetRows.length > 0) {
      try {
        await fetch(SHEETS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: sheetRows }),
          redirect: "manual",
        });
      } catch {
        /* 시트 실패가 수집을 막지 않게 무시 */
      }
    }
  }

  return new NextResponse(null, { status: 204 });
}
