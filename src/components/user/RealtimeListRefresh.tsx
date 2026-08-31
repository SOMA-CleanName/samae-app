"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 목록 페이지 실시간 갱신 — 내 대화에 새 메시지/변경이 오면 서버 컴포넌트를 다시 그린다.
// (방 내부는 자체 구독으로 실시간, 목록은 이 컴포넌트를 꽂아 새 메시지·안읽음 배지를 반영)
// RLS 가 참여 대화의 이벤트만 흘려보내므로 필터 없이 구독해도 내 것만 온다.
// 연속 이벤트는 800ms 디바운스로 refresh 폭주를 막는다.
export function RealtimeListRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("chat-list-refresh")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          bump
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "conversations" },
          bump
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
