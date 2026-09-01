"use server";

// 시뮬레이터 조작 — 모든 진입점에서 어드민인지 먼저 확인한다.
// 여기 있는 함수는 전부 "남 대신" 쓰는 힘이라, 권한 검사가 빠지면 그대로 구멍이 된다.

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  simStartChat,
  simCustomerSay,
  simPhotographerSay,
  simReset,
} from "@/lib/sim-room";

async function assertAdmin(): Promise<void> {
  const me = await getCurrentUser();
  if (me?.role !== "admin") throw new Error("어드민만 쓸 수 있어요.");
}

const back = (photographerId: string) =>
  revalidatePath(`/admin/simulator?p=${photographerId}`);

export async function actStartChat(photographerId: string): Promise<void> {
  await assertAdmin();
  await simStartChat(photographerId);
  back(photographerId);
}

/** 고객 발화 — 검열에 걸리면 그 문구를 그대로 돌려준다(실제 화면과 같게) */
export async function actCustomerSay(
  photographerId: string,
  conversationId: string,
  text: string
): Promise<{ blocked: string | null }> {
  await assertAdmin();
  const blocked = await simCustomerSay(conversationId, text);
  back(photographerId);
  return { blocked };
}

export async function actPhotographerSay(
  photographerId: string,
  conversationId: string,
  text: string
): Promise<void> {
  await assertAdmin();
  await simPhotographerSay(conversationId, text);
  back(photographerId);
}

export async function actReset(photographerId: string): Promise<void> {
  await assertAdmin();
  await simReset(photographerId);
  back(photographerId);
}
