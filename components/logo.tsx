import { Dices } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  /**
   * Size variant for the logo
   * @default "default"
   */
  size?: "sm" | "default" | "lg";
  /**
   * Optional className to apply to the container
   */
  className?: string;
}

/**
 * GameGame logo component with link to home page
 *
 * @example
 * ```tsx
 * <Logo size="lg" />
 * <Logo size="sm" className="my-custom-class" />
 * ```
 */
export function Logo({ size = "default", className }: LogoProps) {
  return (
    <Link
      href="/"
      prefetch={false}
      className={cn("flex items-center space-x-2", className)}
    >
      <Dices
        className={cn({
          "w-6 h-6": size === "sm",
          "w-8 h-8": size === "default",
          "w-8 h-8": size === "lg",
        })}
      />
      <h1
        className={cn("font-bold", {
          "text-xl lg:text-2xl": size === "sm",
          "text-2xl lg:text-4xl": size === "default",
          "text-2xl lg:text-4xl": size === "lg",
        })}
      >
        gamegame
      </h1>
    </Link>
  );
}
