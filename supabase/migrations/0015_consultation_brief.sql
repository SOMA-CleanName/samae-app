-- ════════════════════════════════════════════════════════════════
-- 0015 · 상담 정보(인테이크) — 대화별 1건, 고객이 작성·작가가 열람
--   · 채팅 첫 진입 시 고객이 성별·인원·목적·일정·지역·예산·메모·레퍼런스 입력
--   · 작가는 채팅방에서 수시로 열람
--   · 레퍼런스 사진은 samae-chat 버킷(briefs/{conversationId}/...)에 저장(공개 읽기 정책 재사용)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.consultation_briefs (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  gender          text,
  party_size      int,
  purpose         text,            -- 사진 목적/촬영 종류
  preferred_date  text,            -- 희망 일정(자유 텍스트)
  region          text,            -- 희망 지역
  budget_krw      int,
  note            text,            -- 자유 요청 메모
  ref_image_paths text[] not null default '{}',  -- 레퍼런스 사진 public URL들(최대 5)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.consultation_briefs enable row level security;

-- 열람: 대화 참여자(고객 또는 해당 작가)
drop policy if exists "brief participant read" on public.consultation_briefs;
create policy "brief participant read"
  on public.consultation_briefs for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          c.user_id = auth.uid()
          or c.photographer_id in (
            select id from public.photographers where profile_id = auth.uid()
          )
        )
    )
  );

-- 작성/수정: 대화의 고객만 (실제 쓰기는 서버 service_role 라우트가 수행, RLS는 방어선)
drop policy if exists "brief customer write" on public.consultation_briefs;
create policy "brief customer write"
  on public.consultation_briefs for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
