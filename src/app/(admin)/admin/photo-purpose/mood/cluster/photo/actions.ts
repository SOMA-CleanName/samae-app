"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { clusterFrom } from "@/lib/mood-cluster";
import { appendPhotoClusterReview, loadPhotoClusterCases } from "@/lib/mood-photo-layers-data";

/** 사진 무드 표현 뼈대의 무리 후보 하나를 정한다 — 사전 묶음 쪽(cluster/actions.ts)과 같은 규칙, 기록 파일만 다르다. */
export async function judgePhotoCluster(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id") ?? "").trim();
  const verdict = String(formData.get("verdict") ?? "");
  const found = (await loadPhotoClusterCases()).find((c) => c.id === id);
  if (!found) return;
  const at = new Date().toISOString();
  if (verdict === "keep") {
    await appendPhotoClusterReview({ id, verdict: "keep", at });
  } else if (verdict === "group") {
    const cluster = clusterFrom(found.groups, formData.getAll("g").map(String));
    if (!cluster) return;                        // 둘 이상 골라야 무리다
    await appendPhotoClusterReview({ id, verdict: "group", ...cluster, at });
  } else {
    return;
  }
  revalidatePath("/admin/photo-purpose/mood/cluster/photo");
}
