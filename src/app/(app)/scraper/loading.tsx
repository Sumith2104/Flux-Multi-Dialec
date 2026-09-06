import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="w-full py-8 space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-4">
          {[1, 2].map(i => (
            <Card key={i} className="border-border/80 bg-card/40 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-7 w-20 rounded" />
              </div>
              <Skeleton className="h-4 w-64" />
            </Card>
          ))}
        </div>
        <div className="lg:col-span-4">
          <Card className="border-border/80 bg-card/40 p-5 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-32 w-full rounded" />
          </Card>
        </div>
      </div>
    </div>
  );
}
