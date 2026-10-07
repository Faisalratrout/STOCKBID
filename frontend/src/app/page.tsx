import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-neutral-900">
        Turn Excess Stock Into Opportunities
      </h1>
      <p className="max-w-xl text-neutral-600">
        List your overstocked products, receive offers, and negotiate better deals with verified
        businesses, all in one place.
      </p>
      <div className="flex gap-3">
        <Link href="/register">
          <Button>Create a business account</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary">Log in</Button>
        </Link>
      </div>
    </div>
  );
}
