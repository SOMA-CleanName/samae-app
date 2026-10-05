"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { appendClusterReview, loadClusterCases } from "@/lib/mood-cluster-data";
import { clusterFrom } from "@/lib/mood-cluster";

/**
 * 후보 하나를 정한다. "무리로 묶기" 는 고른 묶음들을 거의 같은 것으로, "묶지 않음" 은 아무것도 안 하는 것.
 * 묶음(D2)은 건드리지 않는다 — build_mood_clusters.py 가 정한 것으로 무리 층만 만든다.
 */
export async function judgeCluster(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") throw new Error("운영자 권한이 필요합니다.");
  const id = String(formData.get("id") ?? "").trim();
  const verdict = String(formData.get("verdict") ?? "");
  const found = (await loadClusterCases()).find((c) => c.id === id);
  if (!found) return;
  const at = new Date().toISOString();
  if (verdict === "keep") {
    await appendClusterReview({ id, verdict: "keep", at });
  } else if (verdict === "group") {
    const cluster = clusterFrom(found.groups, formData.getAll("g").map(String));
    if (!cluster) return;                        // 둘 이상 골라야 무리다
    await appendClusterReview({ id, verdict: "group", ...cluster, at });
  } else {
    return;
  }
  revalidatePath("/admin/photo-purpose/mood/cluster");
}
