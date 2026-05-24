import {
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  ImageIcon,
  Microscope,
  Link2,
  MoreHorizontal,
  RefreshCw,
  CornerDownRight,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import type { AnswerSource, ChatMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";

type TranscriptProps = {
  messages: ChatMessage[];
  activeTab: "answer" | "links" | "images";
  sources: AnswerSource[];
  followUps: string[];
  onPickFollowUp: (prompt: string) => void;
};

function normalizeAnswerText(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .trim();
}

function stripMarkdownForCopy(value: string) {
  return normalizeAnswerText(value)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, "");
}

function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of value.matchAll(pattern)) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-inline-${matchIndex}`;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-[#f8f2e8]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <strong key={key} className="font-semibold text-[#f8f2e8]">
          {token.slice(1, -1)}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={key} className="rounded bg-white/8 px-1 py-0.5 font-mono text-[0.9em] text-[#f7efe1]">
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
    matchIndex += 1;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes;
}

function renderAnswerBlocks(content: string, messageId: string) {
  const normalized = normalizeAnswerText(content);
  const blocks = normalized
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return <p className="text-[#8f8a83]">Thinking...</p>;
  }

  return blocks.flatMap((block, blockIndex) => {
    const rawLines = block.split("\n").filter(Boolean);
    const nodes: ReactNode[] = [];
    let paragraphLines: string[] = [];
    let listLines: string[] = [];

    function flushParagraph() {
      if (!paragraphLines.length) {
        return;
      }

      const lines = paragraphLines;
      const nodeIndex = nodes.length;
      nodes.push(
        <p key={`${messageId}-p-${blockIndex}-${nodeIndex}`} className={cn((blockIndex > 0 || nodeIndex > 0) && "mt-3")}>
          {lines.map((line, lineIndex) => (
            <Fragment key={`${messageId}-p-${blockIndex}-${nodeIndex}-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line, `${messageId}-p-${blockIndex}-${nodeIndex}-${lineIndex}`)}
            </Fragment>
          ))}
        </p>,
      );
      paragraphLines = [];
    }

    function flushList() {
      if (!listLines.length) {
        return;
      }

      const lines = listLines;
      const nodeIndex = nodes.length;
      nodes.push(
        <ul key={`${messageId}-list-${blockIndex}-${nodeIndex}`} className="my-3 space-y-1.5 pl-1">
          {lines.map((line, lineIndex) => (
            <li key={`${messageId}-list-${blockIndex}-${nodeIndex}-${lineIndex}`} className="flex gap-3">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#8f8a83]" />
              <span>{renderInlineMarkdown(line, `${messageId}-list-${blockIndex}-${nodeIndex}-${lineIndex}`)}</span>
            </li>
          ))}
        </ul>,
      );
      listLines = [];
    }

    rawLines.forEach((line, lineIndex) => {
      const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
      const listItem = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);

      if (heading) {
        flushParagraph();
        flushList();
        nodes.push(
          <h3
            key={`${messageId}-h-${blockIndex}-${lineIndex}`}
            className={cn("font-semibold text-[#f8f2e8]", (blockIndex > 0 || nodes.length > 0) && "mt-4")}
          >
            {renderInlineMarkdown(heading[2], `${messageId}-h-${blockIndex}-${lineIndex}`)}
          </h3>,
        );
        return;
      }

      if (listItem) {
        flushParagraph();
        listLines.push(listItem[1]);
        return;
      }

      flushList();
      paragraphLines.push(line);
    });

    flushParagraph();
    flushList();

    return nodes;
  });
}

function sourceHost(source: AnswerSource) {
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.title || "source";
  }
}

function SourceChips({ sources }: { sources: AnswerSource[] }) {
  if (!sources.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {sources.slice(0, 5).map(source => (
        <a
          key={`${source.url}-${source.title}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md bg-[#242424] px-2 py-0.5 text-[11px] font-medium text-[#ddd7cc] transition hover:bg-[#303030]"
          title={source.title || source.url}
        >
          <ExternalLink className="size-3 shrink-0 text-[#a7a197]" />
          <span className="truncate">{sourceHost(source)}</span>
        </a>
      ))}
    </div>
  );
}

function AnswerActions({ content, sourceCount }: { content: string; sourceCount: number }) {
  const [copied, setCopied] = useState(false);
  const actions = [
    { label: "Share", icon: Share2 },
    { label: "Download", icon: Download },
    { label: "Rewrite", icon: RefreshCw },
  ];

  async function copyAnswer() {
    const value = stripMarkdownForCopy(content);

    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  return (
    <div className="flex items-center justify-between pt-2 text-[#858079]">
      <div className="flex items-center gap-2">
        {actions.map(action => {
          const Icon = action.icon;

          return (
            <button
              key={action.label}
              type="button"
              className="grid size-7 place-items-center rounded-md transition hover:bg-white/6 hover:text-[#e9e3d8]"
              title={action.label}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void copyAnswer()}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition hover:bg-white/6 hover:text-[#e9e3d8]"
          title="Copy"
        >
          <Copy className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
        {!!sourceCount && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#202020] px-2 text-xs text-[#aaa49b]">
            <Link2 className="size-3" />
            {sourceCount} sources
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md transition hover:bg-white/6 hover:text-[#e9e3d8]"
          title="Good answer"
        >
          <ThumbsUp className="size-3.5" />
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md transition hover:bg-white/6 hover:text-[#e9e3d8]"
          title="Bad answer"
        >
          <ThumbsDown className="size-3.5" />
        </button>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-md transition hover:bg-white/6 hover:text-[#e9e3d8]"
          title="More"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function AssistantMessage({ message, sources, showSteps }: { message: ChatMessage; sources: AnswerSource[]; showSteps: boolean }) {
  return (
    <div className="space-y-3">
      {showSteps && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-0 py-0.5 text-[13px] font-semibold text-[#9f9a92] transition hover:text-[#e4ded4]"
        >
          Completed 2 steps
          <ChevronRight className="size-3.5 text-[#747068]" />
        </button>
      )}
      <div className="max-w-none font-serif text-[17px] leading-8 text-[#f0eadf] md:text-[18px] md:leading-8">
        {renderAnswerBlocks(message.content, message.id)}
      </div>
      <SourceChips sources={sources} />
      {message.isStreaming && (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[#8f8a83]">
          <span className="size-2 rounded-full bg-[#d8d3ca] animate-pulse" />
          Streaming answer
        </div>
      )}
      {!message.isStreaming && <AnswerActions content={message.content} sourceCount={sources.length} />}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="ml-auto max-w-[560px] rounded-2xl bg-[#1d1d1d] px-4 py-3 text-[14px] leading-6 text-[#ece7dd] shadow-[0_10px_32px_rgba(0,0,0,0.18)] md:text-[15px]">
      {message.content}
    </div>
  );
}

function LinksPanel({ sources }: { sources: AnswerSource[] }) {
  if (!sources.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-[#181818] p-8 text-center text-sm text-[#817c74]">
        Links from the current streamed answer will appear here. Reloaded conversations do not include persisted source data yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {sources.map(source => (
        <a
          key={`${source.url}-${source.title}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-[#191919] px-4 py-3 transition hover:bg-[#1f1f1f]"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[#efeade]">{source.title || source.url}</div>
            <div className="mt-1 truncate text-xs text-[#827d75]">{source.url}</div>
          </div>
          <ExternalLink className="mt-0.5 size-4 shrink-0 text-[#7a756d]" />
        </a>
      ))}
    </div>
  );
}

function ImagesPanel() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-[#181818] p-9 text-center">
      <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl border border-white/10 bg-[#202020] text-[#dcd7cf]">
        <ImageIcon className="size-5" />
      </div>
      <div className="text-base text-[#f1ece3]">No image results yet</div>
      <div className="mt-2 text-xs text-[#7d786f]">
        The current backend does not return image search results, so this tab stays as a visual placeholder.
      </div>
    </div>
  );
}

export function Transcript({ messages, activeTab, sources, followUps, onPickFollowUp }: TranscriptProps) {
  if (activeTab === "links") {
    return <LinksPanel sources={sources} />;
  }

  if (activeTab === "images") {
    return <ImagesPanel />;
  }

  return (
    <div className="space-y-5">
      {messages.map((message, index) => {
        const isLastAssistant = message.role === "Assistant" && messages.slice(index + 1).every(next => next.role !== "Assistant");

        return (
          <div key={message.id} className={cn(message.role === "User" ? "flex justify-end" : "max-w-[820px]")}>
            {message.role === "User" ? (
              <UserMessage message={message} />
            ) : (
              <AssistantMessage message={message} sources={isLastAssistant ? sources : []} showSteps={index > 0} />
            )}
          </div>
        );
      })}

      {!!followUps.length && (
        <div className="pt-3">
          <div className="mb-4 text-[20px] font-semibold text-[#f0eadf]">
            Follow-ups
          </div>
          <div className="divide-y divide-white/8 border-y border-white/8">
            {followUps.map((prompt, index) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onPickFollowUp(prompt)}
                className="group flex w-full items-start justify-between gap-5 py-3.5 text-left transition hover:bg-white/[0.03]"
              >
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <CornerDownRight className="mt-1 size-4 shrink-0 text-[#8d877e]" />
                  <span className="text-[17px] leading-7 text-[#f0eadf] group-hover:text-white">
                    {prompt}
                  </span>
                </span>
                {index === 0 && (
                  <span className="hidden shrink-0 items-center gap-2 pt-1 text-sm text-[#aaa49b] sm:inline-flex">
                    <Microscope className="size-4" />
                    Deep research
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
