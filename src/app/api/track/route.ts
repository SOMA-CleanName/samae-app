import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 행동 분석 수집 — 클라이언트 트래커가 sendBeacon/fetch 로 보낸 이벤트를 적재.
// service-role 로 insert(테이블은 anon 쓰기 미허용). 로그인 시 profile_id 첨부.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const b = body as { sessionId?: unknown; events?: unknown };
  const sessionId = String(b.sessionId ?? "").slice(0, 64);
  const events = Array.isArray(b.events) ? b.events.slice(0, 30) : [];
  if (!sessionId || events.length === 0) return new NextResponse(null, { status: 204 });

  // 누구인지(첨부용) — 쿠키 기반(검증 네트워크 없이) 가볍게
  let profileId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    profileId = data.session?.user?.id ?? null;
  } catch {
    profileId = null;
  }

  const str = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
  const rows = events
    .map((e) => {
      const ev = e as Record<string, unknown>;
      return {
        session_id: sessionId,
        profile_id: profileId,
        type: ev.type === "click" ? "click" : "pageview",
        path: str(ev.path, 300) ?? "",
        label: str(ev.label, 200),
        target: str(ev.target, 300),
        referrer: str(ev.referrer, 300),
      };
    })
    .filter((r) => r.path);

  if (rows.length > 0) {
    const admin = createAdminClient();
    await admin.from("analytics_events").insert(rows);
  }
  return new NextResponse(null, { status: 204 });
}
