import { PostListSkeleton, Skeleton, VideoGridSkeleton } from "@/components/Skeleton";

/** Shown instantly while any page loads. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <VideoGridSkeleton count={3} />
      <div className="max-w-2xl">
        <PostListSkeleton count={3} />
      </div>
    </div>
  );
}
