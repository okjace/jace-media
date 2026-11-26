"use client";

/** Rates a post or video as appropriate (1) or inappropriate (-1). */
export async function rate(target: string, rating: 1 | -1): Promise<boolean> {
  const res = await fetch("/api/ratings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, rating }) });
  return res.ok;
}
