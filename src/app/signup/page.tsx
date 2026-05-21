import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const user = await currentUser();
  if (user) redirect("/");
  return (
    <main>
      <header className="brand-header px-5 py-5">
        <Link href="/" className="text-sm font-bold">
          ← Back
        </Link>
        <h1 className="mt-4 text-2xl font-black tracking-tight">
          Open an account
        </h1>
        <p className="mt-1 text-sm text-white/80">
          $3,000,000 virtual bankroll on signup.
        </p>
      </header>
      <SignupForm />
    </main>
  );
}
