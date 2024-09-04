import { Dices } from "lucide-react";
import Link from "next/link";

export default function Header() {
  return (
    <header className="container mx-auto px-4 py-8">
      <Link
        href="/"
        prefetch={false}
        className="flex items-center justify-center space-x-2"
      >
        <Dices className="w-8 h-8" />
        <h1 className="text-4xl font-bold">gamegame</h1>
      </Link>
    </header>
  );
}
