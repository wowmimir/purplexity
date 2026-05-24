import { ArrowUp, Globe, Plus, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ComposerProps = {
  onSubmit: (value: string) => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  docked?: boolean;
  placeholder?: string;
};

export function Composer({
  onSubmit,
  disabled = false,
  loading = false,
  autoFocus = false,
  docked = false,
  placeholder = "Ask anything...",
}: ComposerProps) {
  const [value, setValue] = useState("");

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled || loading) {
      return;
    }

    await onSubmit(trimmed);
    setValue("");
  }

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-[0_14px_48px_rgba(0,0,0,0.34)]",
        docked ? "backdrop-blur-xl" : "bg-[#191919]/96",
      )}
    >
      <div className="p-3 pb-2">
        <Textarea
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          disabled={disabled || loading}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={cn(
            "resize-none border-none bg-transparent px-0 py-0 text-[15px] leading-6 text-[#f3efe6] shadow-none ring-0 placeholder:text-[#8a847b] focus-visible:ring-0 md:text-[16px]",
            docked ? "min-h-[56px]" : "min-h-[76px]",
          )}
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/6 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-[#9f9b93]">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-[#232323] px-2.5 py-1 transition hover:bg-[#2a2a2a]"
          >
            <Plus className="size-3.5" />
            Attach
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-[#232323] px-2.5 py-1 transition hover:bg-[#2a2a2a]"
          >
            <Search className="size-3.5" />
            Search
          </button>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-[#232323] px-2.5 py-1 sm:inline-flex">
            <Globe className="size-3.5" />
            Focus
          </span>
        </div>
        <Button
          onClick={() => void submit()}
          disabled={disabled || loading || !value.trim()}
          size="icon"
          className="size-9 rounded-full bg-[#e7e4dd] text-[#111] hover:bg-white"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}
