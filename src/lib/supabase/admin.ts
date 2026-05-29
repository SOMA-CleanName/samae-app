import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * ⚠️ service_role 클라이언트 — RLS를 우회한다. 서버에서만 사용.
 * 결제 확정·정산·예약 상태 전이·작가 승인 등 "돈·상태를 바꾸는" 작업 전용.
 * 절대 클라이언트 컴포넌트나 NEXT_PUBLIC_ 경로로 노출하지 말 것.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
