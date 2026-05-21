import Link from "next/link";
import { LoginForm } from "./LoginForm";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const user = await currentUser();
  if (user) redirect(searchParams.next ?? "/");
  return (
    <main>
      <header className="brand-header px-5 py-5">
        <Link href="/" className="text-sm font-bold">
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-black tracking-tight">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-white/80">
          Trade lines with your virtual bankroll.
        </p>
      </header>
      <LoginForm next={searchParams.next ?? "/"} />
    </main>
  );
}
