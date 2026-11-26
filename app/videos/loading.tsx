import { Skeleton, VideoGridSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading videos">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-10 w-full rounded-full" />
      <VideoGridSkeleton count={9} />
    </div>
  );
}
