import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] items-center justify-center gap-4" aria-busy="true" aria-label="Loading Shorts">
      <Skeleton className="aspect-[9/16] h-full rounded-2xl" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-12 rounded-full" />
        ))}
      </div>
    </div>
  );
}
