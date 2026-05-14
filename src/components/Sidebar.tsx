"use client";

import { PanelLeftClose, PanelLeft, Plus, MessageSquare, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { useState } from "react";

type Session = {
  id: string;
  preview: string;
};

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessionId: string;
  sessionsList: Session[];
  onNewChat: () => void;
  onLoadChat: (id: string) => void;
  onDeleteChat: (id: string) => void; // <--- ADD THIS LINE
}
export function Sidebar({
  isOpen,
  onToggle,
  sessionId,
  sessionsList,
  onNewChat,
  onLoadChat,
  onDeleteChat, // <--- ADD THIS LINE
}: SidebarProps) {
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar transition-sidebar ${isOpen ? "w-[260px]" : "w-0 opacity-0 pointer-events-none"
          } md:relative md:opacity-100 md:pointer-events-auto ${isOpen ? "md:w-[260px]" : "md:w-0"
          }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-14 px-3">
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
          <button
            onClick={onNewChat}
            className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
            aria-label="New chat"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-2 pb-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-sidebar-border hover:bg-sidebar-accent text-sidebar-foreground font-medium transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {sessionsList && sessionsList.length > 0 && (
            <div className="space-y-0.5">
              {sessionsList.map((session) => (
                <div
                  key={session.id}
                  className="relative group"
                  onMouseEnter={() => setHoveredSession(session.id)}
                  onMouseLeave={() => setHoveredSession(null)}
                >
                  <button
                    onClick={() => onLoadChat(session.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${sessionId === session.id
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      }`}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                    <span className="truncate flex-1 pr-8">{session.preview}</span>
                  </button>

                  {/* Hover Actions */}
                  {hoveredSession === session.id && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-sidebar-accent rounded-md p-0.5">
                      <button className="p-1 rounded hover:bg-sidebar-border transition-colors text-muted-foreground hover:text-foreground">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(session.id);
                        }}
                        className="p-1 rounded hover:bg-sidebar-border transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {sessionsList && sessionsList.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No conversations yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start a new chat to begin
              </p>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-sm">
              U
            </div>
            <span className="text-sm text-sidebar-foreground">User</span>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Toggle Button (when sidebar is closed) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed top-3 left-3 z-50 p-2.5 rounded-lg bg-background hover:bg-secondary text-foreground transition-colors md:absolute"
          aria-label="Open sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
