import { Menu } from "lucide-react";

export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-background border-b border-border/50">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">
          Konkani Companion
        </h1>
      </div>
    </header>
  );
}