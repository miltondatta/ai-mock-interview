import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row md:px-10">
        <div className="flex items-center gap-2.5">
          <img
            src={"/logo.svg"}
            alt="logo"
            width={22}
            height={22}
            className="rounded-lg"
          />
          <span className="font-semibold text-foreground">
            AI Mock Interview
          </span>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/how-it-works" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/upgrade" className="hover:text-foreground">
            Pricing
          </Link>
        </div>

        <p>&copy; {new Date().getFullYear()} AI Mock Interview. All rights reserved.</p>
      </div>
    </footer>
  );
}
