"use client";

import { PanelLeftClose, Plus, MessageSquare, Trash2 } from "lucide-react";

type Session = {
  id: string;
  preview: string;
};

interface SidebarProps {
  /** Expanded on tablet/desktop (md and up). */
  desktopOpen: boolean;
  /** Shown as an overlay on phones. */
  mobileOpen: boolean;
  onClose: () => void;
  sessionId: string;
  sessionsList: Session[];
  onNewChat: () => void;
  onLoadChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export function Sidebar({
  desktopOpen,
  mobileOpen,
  onClose,
  sessionId,
  sessionsList,
  onNewChat,
  onLoadChat,
  onDeleteChat,
}: SidebarProps) {
  return (
    <>
      <aside
        aria-label="Chat history"
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:translate-x-0 md:transition-[width] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopOpen ? "md:w-[260px]" : "md:w-0 md:overflow-hidden md:border-r-0"}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground md:hidden">Konkani Companion</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center gap-2.5 rounded-xl border border-border-strong px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sessionsList.length > 0 ? (
            <>
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
                Recent
              </p>
              <ul className="space-y-0.5">
                {sessionsList.map((session) => (
                  <li key={session.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onLoadChat(session.id)}
                      aria-current={sessionId === session.id ? "true" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-lg py-2 pl-3 pr-9 text-left text-sm transition-colors ${
                        sessionId === session.id
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      }`}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="truncate">{session.preview}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(session.id);
                      }}
                      aria-label="Delete chat"
                      title="Delete chat"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-subtle-foreground opacity-100 transition-opacity hover:bg-surface-3 hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="mt-1 text-xs text-subtle-foreground">Your chats will appear here</p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
    </>
  );
}
