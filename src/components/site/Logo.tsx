import Image from "next/image";
import Link from "next/link";
import { BRAND_LOGO } from "@/lib/constants/brand";
import { cn } from "@/lib/cn";

export function Logo({
  variant = "default",
  className,
  priority,
  href = "/",
}: {
  variant?: "default" | "onDark";
  className?: string;
  priority?: boolean;
  href?: string | null;
}) {
  const logo = BRAND_LOGO[variant];
  const img = (
    <Image
      src={logo.src}
      alt={BRAND_LOGO.alt}
      width={logo.width}
      height={logo.height}
      priority={priority}
      className={cn("h-14 w-auto md:h-16", className)}
    />
  );
  if (!href) return img;
  return (
    <Link href={href} className="inline-flex shrink-0 rounded-lg" aria-label="Kumar Ayurveda — home">
      {img}
    </Link>
  );
}
