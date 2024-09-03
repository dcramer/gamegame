import { Dices } from "lucide-react";

export default function Header() {
  return (
    <header className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-center space-x-2">
        <Dices className="w-8 h-8 text-gray-800" />
        <h1 className={`text-4xl font-bold text-center text-gray-800}`}>
          gamegame
        </h1>
      </div>
    </header>
  );
}
