import Link from "next/link";

export function Footer() {
  return (
    <footer className="container mx-auto px-4 py-8 text-center text-gray-600">
      <p>
        &copy; 2023 gamegame.ai &middot;{" "}
        <Link prefetch={false} href="https://github.com/dcramer/gamegame">
          GitHub
        </Link>
      </p>
    </footer>
  );
}
