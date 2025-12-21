import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageContainer({ children, className, noPadding }: PageContainerProps) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto pb-20",
        !noPadding && "p-4",
        className
      )}
    >
      <div className="mx-auto max-w-2xl">
        {children}
      </div>
    </div>
  );
}
