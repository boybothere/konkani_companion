import type { ReactNode } from "react";
import { PanelLeft, MessageSquare, FileSearch } from "lucide-react";

export type Tab = "chat" | "document";

interface HeaderProps {
  onToggleSidebar: () => void;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Shown between the app name and the tabs, e.g. the current chat's name and actions. */
  children?: ReactNode;
}

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "document", label: "Document Lens", icon: FileSearch },
];

export function Header({ onToggleSidebar, activeTab, onTabChange, children }: HeaderProps) {
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

      {children ? (
        <div className="flex min-w-0 flex-1 items-center sm:border-l sm:border-border sm:pl-2">{children}</div>
      ) : (
        <div className="flex-1" />
      )}

      <nav
        aria-label="Mode"
        className="flex shrink-0 items-center rounded-xl border border-border bg-card p-0.5"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-current={activeTab === id ? "page" : undefined}
            aria-label={label}
            title={label}
            className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 sm:px-3 text-[13px] font-medium transition-colors ${
              activeTab === id ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {/* On phones, make room for the chat name by showing icons only */}
            <span className={children ? "hidden sm:inline" : ""}>{label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
