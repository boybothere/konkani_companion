import { PanelLeft, MessageSquare, FileSearch } from "lucide-react";

export type Tab = "chat" | "document";

interface HeaderProps {
  onToggleSidebar: () => void;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "document", label: "Document Lens", icon: FileSearch },
];

export function Header({ onToggleSidebar, activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2 sm:px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle chat history"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <h1 className="hidden truncate text-[15px] font-semibold tracking-tight text-foreground sm:block">
        Konkani Companion
      </h1>

      <nav
        aria-label="Mode"
        className="ml-auto flex items-center rounded-xl border border-border bg-card p-0.5 sm:ml-auto"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
              activeTab === id ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
