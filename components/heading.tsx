import { cn } from "@/lib/utils";

export default function Heading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("text-5xl font-extrabold mb-6", className)}>
      {children}
    </h2>
  );
}
