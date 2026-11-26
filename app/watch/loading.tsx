import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row" aria-busy="true" aria-label="Loading video">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-10 w-1/2" />
      </div>
      <div className="flex w-full flex-col gap-3 lg:w-[360px]">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="aspect-video w-40 shrink-0" />
            <div className="flex flex-1 flex-col gap-2 py-1">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
