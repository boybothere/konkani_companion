"use client";

import { useRef, useState } from "react";
import { PanelLeftClose, Plus, MessageSquare, Trash2, LogOut, Pencil, Search, X } from "lucide-react";

type Session = {
  id: string;
  label: string;
  /** Present for search results: text around the match. */
  snippet?: string;
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
  onRenameChat: (id: string, title: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  account: { name: string | null; email: string | null; photoURL: string | null };
  onSignOut: () => void;
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
  onRenameChat,
  searchQuery,
  onSearchChange,
  account,
  onSignOut,
}: SidebarProps) {
  const initial = (account.name || account.email || "?").trim().charAt(0).toUpperCase();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const startRename = (session: Session) => {
    setEditingId(session.id);
    setDraft(session.label);
    requestAnimationFrame(() => editRef.current?.select());
  };

  const commitRename = (session: Session) => {
    setEditingId(null);
    if (draft.trim() !== session.label) onRenameChat(session.id, draft);
  };

  const searching = searchQuery.trim().length > 0;

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

        <div className="px-3 pb-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-sm transition-colors focus-within:border-border-strong">
            <Search className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onSearchChange("")}
              placeholder="Search chats"
              aria-label="Search chats"
              className="min-w-0 flex-1 bg-transparent text-sidebar-foreground placeholder:text-subtle-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {searching && (
              <button type="button" onClick={() => onSearchChange("")} aria-label="Clear search" className="text-subtle-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sessionsList.length > 0 ? (
            <>
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">
                {searching ? `${sessionsList.length} result${sessionsList.length === 1 ? "" : "s"}` : "Recent"}
              </p>
              <ul className="space-y-0.5">
                {sessionsList.map((session) => (
                  <li key={session.id} className="group relative">
                    {editingId === session.id ? (
                      <input
                        ref={editRef}
                        value={draft}
                        maxLength={120}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commitRename(session)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(session);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        aria-label="Chat name"
                        className="w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground focus:outline-none"
                      />
                    ) : (
                    <>
                    <button
                      type="button"
                      onClick={() => onLoadChat(session.id)}
                      aria-current={sessionId === session.id ? "true" : undefined}
                      className={`flex w-full items-start gap-2.5 rounded-lg py-2 pl-3 pr-16 text-left text-sm transition-colors ${
                        sessionId === session.id
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      }`}
                    >
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                      <span className="min-w-0">
                        <span className="block truncate">{session.label}</span>
                        {session.snippet && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-subtle-foreground [overflow-wrap:anywhere]">
                            {session.snippet}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(session);
                        }}
                        aria-label="Rename chat"
                        title="Rename chat"
                        className="rounded-md p-1.5 text-subtle-foreground hover:bg-surface-3 hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(session.id);
                        }}
                        aria-label="Delete chat"
                        title="Delete chat"
                        className="rounded-md p-1.5 text-subtle-foreground hover:bg-surface-3 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">{searching ? "No matching chats" : "No conversations yet"}</p>
              <p className="mt-1 text-xs text-subtle-foreground">
                {searching ? "Try a different word, in English or Konkani" : "Your chats will appear here"}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-3 py-3">
          {account.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
            <img src={account.photoURL} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-medium text-foreground">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-sidebar-foreground">{account.name || "Signed in"}</p>
            {account.email && <p className="truncate text-xs text-subtle-foreground">{account.email}</p>}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-subtle-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
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
