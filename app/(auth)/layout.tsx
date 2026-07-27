import Link from "next/link";
import { FileSearch } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold">
        <FileSearch aria-hidden className="size-5 text-primary" />
        Resume Reviewer
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
