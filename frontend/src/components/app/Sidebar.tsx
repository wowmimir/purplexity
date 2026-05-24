import { History, LogOut, PanelLeft, PenSquare, Sparkles } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import type { ConversationListItem } from "@/lib/chat";
import { cn } from "@/lib/utils";

type SidebarProps = {
  user: User;
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSelectConversation: (conversationId: string) => void;
  onLogout: () => void;
};

export function Sidebar({
  user,
  conversations,
  activeConversationId,
  collapsed,
  onToggle,
  onNewChat,
  onSelectConversation,
  onLogout,
}: SidebarProps) {
  const initials = user.email?.slice(0, 1).toUpperCase() ?? "U";

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-white/6 bg-[#161616] transition-all duration-200",
        collapsed ? "w-[88px]" : "w-[280px]",
      )}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <button
          type="button"
          className="flex items-center gap-3 text-[#f3efe6]"
          onClick={onNewChat}
        >
          <div className="grid size-8 place-items-center rounded-xl border border-white/10 bg-[#1d1d1d]">
            <Sparkles className="size-4" />
          </div>
          {!collapsed && <span className="text-[15px] font-medium tracking-tight">Purplexity</span>}
        </button>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-[#9e9a92] transition hover:bg-white/5 hover:text-white"
          onClick={onToggle}
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <div className="px-4">
        <Button
          onClick={onNewChat}
          className={cn(
            "h-12 w-full justify-start rounded-2xl bg-[#242424] text-[#f1ece2] hover:bg-[#2b2b2b]",
            collapsed && "justify-center px-0",
          )}
        >
          <PenSquare className="size-4" />
          {!collapsed && <span>New</span>}
        </Button>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
        {!collapsed && (
          <div className="mb-3 flex items-center gap-2 px-2 text-xs uppercase tracking-[0.18em] text-[#77726b]">
            <History className="size-3.5" />
            Recents
          </div>
        )}
        <div className="flex-1 space-y-1 overflow-y-auto pb-4">
          {conversations.map(conversation => {
            const active = conversation.id === activeConversationId;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className={cn(
                  "flex w-full items-start rounded-2xl px-3 py-3 text-left transition",
                  active ? "bg-[#222222] text-[#f3efe6]" : "text-[#9f9b93] hover:bg-white/5 hover:text-[#ece7dc]",
                  collapsed && "justify-center px-0",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-sm font-medium", collapsed && "hidden")}>
                    {conversation.title || "Untitled chat"}
                  </div>
                  {!collapsed && <div className="truncate text-xs text-[#6f6a63]">{conversation.slug}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/6 p-4">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="grid size-10 place-items-center rounded-full bg-[#d5d1ca] text-sm font-semibold text-[#111]">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-[#f3efe6]">{user.email}</div>
              <div className="text-xs text-[#77726b]">Personal</div>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={onLogout}
              className="grid size-9 place-items-center rounded-full text-[#9f9b93] transition hover:bg-white/5 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
