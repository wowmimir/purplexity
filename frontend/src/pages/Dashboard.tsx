import { Composer } from "@/components/app/Composer";
import { Sidebar } from "@/components/app/Sidebar";
import { Transcript } from "@/components/app/Transcript";
import { createClient } from "@/lib/supabase/client";
import {
  fetchConversation,
  fetchConversations,
  streamFollowUp,
  streamNewConversation,
  type AnswerSource,
  type ChatMessage,
  type ConversationListItem,
  type StreamEvent,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import {
  Ellipsis,
  Globe,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Lock,
  Share2,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

const supabase = createClient();

type TabKey = "answer" | "links" | "images";

const tabs: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
  { key: "answer", label: "Answer", icon: Sparkles },
  { key: "links", label: "Links", icon: Globe },
  { key: "images", label: "Images", icon: ImageIcon },
];

const SOURCE_STORAGE_PREFIX = "purplexity:sources:";
const AUTO_SCROLL_THRESHOLD = 80;

function sourceStorageKey(conversationId: string) {
  return `${SOURCE_STORAGE_PREFIX}${conversationId}`;
}

function readStoredSources(conversationId: string) {
  try {
    const value = sessionStorage.getItem(sourceStorageKey(conversationId));
    return value ? (JSON.parse(value) as AnswerSource[]) : [];
  } catch {
    return [];
  }
}

function storeSources(conversationId: string, nextSources: AnswerSource[]) {
  if (!nextSources.length) {
    return;
  }

  sessionStorage.setItem(sourceStorageKey(conversationId), JSON.stringify(nextSources));
}

function makeMessageId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function newUserMessage(content: string): ChatMessage {
  return {
    id: makeMessageId("user"),
    role: "User",
    content,
    createdAt: new Date().toISOString(),
  };
}

function newAssistantMessage(): ChatMessage {
  return {
    id: makeMessageId("assistant"),
    role: "Assistant",
    content: "",
    rawContent: "",
    createdAt: new Date().toISOString(),
    isStreaming: true,
  };
}

function normalizeAssistantText(raw: string) {
  return raw
    .replace(/^```(?:json|markdown)?/i, "")
    .replace(/```$/i, "")
    .replace(/\\n/g, "\n")
    .trimStart();
}

function ensureAssistantMessage(messages: ChatMessage[]): ChatMessage[] {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role === "Assistant" && lastMessage.isStreaming) {
    return messages;
  }

  return [...messages, newAssistantMessage()];
}

function updateStreamedAssistant(messages: ChatMessage[], token: string) {
  const nextMessages = ensureAssistantMessage(messages);
  const lastMessage = nextMessages.at(-1);

  if (!lastMessage || lastMessage.role !== "Assistant") {
    return nextMessages;
  }

  const rawContent = `${lastMessage.rawContent ?? lastMessage.content}${token}`;

  return [
    ...nextMessages.slice(0, -1),
    {
      ...lastMessage,
      rawContent,
      content: normalizeAssistantText(rawContent),
      isStreaming: true,
    },
  ];
}

function finalizeAssistant(messages: ChatMessage[]) {
  const lastMessage = messages.at(-1);

  if (!lastMessage || lastMessage.role !== "Assistant") {
    return messages;
  }

  return [
    ...messages.slice(0, -1),
    {
      ...lastMessage,
      content: normalizeAssistantText(lastMessage.rawContent ?? lastMessage.content).trim(),
      isStreaming: false,
    },
  ];
}

function messageFromServer(message: {
  id: string | number;
  role: "User" | "Assistant";
  content: string;
  createdAt?: string;
}): ChatMessage {
  return {
    id: String(message.id),
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    isStreaming: false,
  };
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("answer");
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydratedConversation, setIsHydratedConversation] = useState(false);
  const streamConversationIdRef = useRef<string | null>(null);
  const pendingSourcesRef = useRef<AnswerSource[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const activeConversationId = params.conversationId ?? null;

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;

    if (!scrollArea || activeTab !== "answer") {
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: submitting ? "smooth" : "auto",
    });
  }, [messages, activeTab, submitting]);

  function handleScrollAreaScroll() {
    const scrollArea = scrollAreaRef.current;

    if (!scrollArea) {
      return;
    }

    const distanceFromBottom = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD;
  }

  useEffect(() => {
    let mounted = true;

    async function loadAuth() {
      const [{ data: userData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);

      if (!mounted) {
        return;
      }

      const resolvedUser = userData.user ?? sessionData.session?.user ?? null;
      setUser(resolvedUser);
      setAuthResolved(true);

      if (!resolvedUser) {
        navigate("/auth", { replace: true });
      }
    }

    void loadAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setAuthResolved(true);

      if (!nextUser) {
        navigate("/auth", { replace: true });
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function loadConversations() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || cancelled) {
        return;
      }

      try {
        const conversationList = await fetchConversations(session.access_token);
        if (!cancelled) {
          setConversations(conversationList);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load conversations");
        }
      }
    }

    void loadConversations();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (!activeConversationId) {
      shouldAutoScrollRef.current = true;
      setMessages([]);
      setSources([]);
      pendingSourcesRef.current = [];
      setFollowUps([]);
      setIsHydratedConversation(false);
      setLoadingConversation(false);
      return;
    }

    if (streamConversationIdRef.current === activeConversationId) {
      streamConversationIdRef.current = null;
      setSources(current => (current.length ? current : readStoredSources(activeConversationId)));
      setIsHydratedConversation(true);
      return;
    }

    let cancelled = false;

    async function loadConversation() {
      setLoadingConversation(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token || cancelled) {
          return;
        }

        const conversation = await fetchConversation(session.access_token, activeConversationId);

        if (cancelled) {
          return;
        }

        shouldAutoScrollRef.current = true;
        setMessages(conversation.messages.map(messageFromServer));
        setSources(readStoredSources(activeConversationId));
        setFollowUps([]);
        setIsHydratedConversation(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load conversation");
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingConversation(false);
        }
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, user]);

  async function refreshConversations() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return;
    }

    const conversationList = await fetchConversations(session.access_token);
    setConversations(conversationList);
  }

  function applyStreamEvent(event: StreamEvent) {
    switch (event.type) {
      case "answer":
        setMessages(current => updateStreamedAssistant(current, event.token));
        break;
      case "followUps":
        setFollowUps(event.followUps);
        break;
      case "sources":
        pendingSourcesRef.current = event.sources;
        setSources(event.sources);
        if (activeConversationIdRef.current) {
          storeSources(activeConversationIdRef.current, event.sources);
        }
        break;
      case "conversation":
        storeSources(event.conversationId, pendingSourcesRef.current);
        streamConversationIdRef.current = event.conversationId;
        navigate(`/c/${event.conversationId}`);
        void refreshConversations();
        break;
      case "error":
        setError(event.message);
        break;
      case "done":
        setMessages(current => finalizeAssistant(current));
        setSubmitting(false);
        break;
    }
  }

  async function submitPrompt(query: string) {
    if (!user || submitting) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      navigate("/auth", { replace: true });
      return;
    }

    setSubmitting(true);
    setError(null);
    setActiveTab("answer");
    setFollowUps([]);
    setSources([]);
    pendingSourcesRef.current = [];
    shouldAutoScrollRef.current = true;
    setMessages(current => [...current, newUserMessage(query), newAssistantMessage()]);

    try {
      if (activeConversationId) {
        await streamFollowUp(session.access_token, activeConversationId, query, applyStreamEvent);
      } else {
        await streamNewConversation(session.access_token, query, applyStreamEvent);
      }
    } catch (submitError) {
      setSubmitting(false);
      setMessages(current => finalizeAssistant(current));
      setError(submitError instanceof Error ? submitError.message : "Failed to send prompt");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    navigate("/auth", { replace: true });
  }

  function handleNewChat() {
    shouldAutoScrollRef.current = true;
    setMessages([]);
    setSources([]);
    pendingSourcesRef.current = [];
    setFollowUps([]);
    setError(null);
    setIsHydratedConversation(false);
    navigate("/");
  }

  function renderBody() {
    if (loadingConversation && activeConversationId && !messages.length) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center text-[#8d887f]">
          <LoaderCircle className="mr-3 size-5 animate-spin" />
          Loading conversation
        </div>
      );
    }

    if (!messages.length && !activeConversationId) {
      return (
        <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-[860px] flex-col items-center justify-center px-6 text-center">
          <div className="mb-8 grid size-16 place-items-center rounded-[22px] border border-white/10 bg-[#1d1d1d] text-[#f2ede4] shadow-[0_10px_50px_rgba(0,0,0,0.3)]">
            <Sparkles className="size-7" />
          </div>
          <h1 className="mb-3 text-[42px] font-medium tracking-[-0.04em] text-[#f4efe6] md:text-[56px]">
            Where knowledge begins.
          </h1>
          <p className="mb-10 max-w-[620px] text-[17px] leading-8 text-[#8b867e]">
            Search the web, synthesize results, and continue the thread without leaving the conversation.
          </p>
          <Composer onSubmit={submitPrompt} loading={submitting} autoFocus placeholder="Ask anything..." />
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-[860px] px-6 pb-24 pt-5">
        <Transcript
          messages={messages}
          activeTab={activeTab}
          sources={sources}
          followUps={followUps}
          onPickFollowUp={prompt => void submitPrompt(prompt)}
        />
      </div>
    );
  }

  if (!authResolved) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#111111] text-[#f3efe6]">
        <div className="inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/4 px-5 py-3 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Restoring session
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen overflow-hidden bg-[#111111] text-[#f3efe6]">
      <div className="flex h-screen min-h-0">
        <div className="hidden lg:block">
          <Sidebar
            user={user}
            conversations={conversations}
            activeConversationId={activeConversationId}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(current => !current)}
            onNewChat={handleNewChat}
            onSelectConversation={conversationId => navigate(`/c/${conversationId}`)}
            onLogout={() => void handleLogout()}
          />
        </div>

        <main className="relative flex h-screen min-h-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 shrink-0 border-b border-white/6 bg-[#111111]/88 backdrop-blur-xl">
            <div className="flex items-center justify-between px-5 py-4 md:px-8">
              <div className="flex items-center gap-2 overflow-x-auto">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const active = tab.key === activeTab;
                  const label = tab.key === "links" && sources.length ? `Links ${sources.length}` : tab.label;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                        active
                          ? "border-white/12 bg-[#1f1f1f] text-[#f3efe6]"
                          : "border-transparent text-[#868178] hover:bg-white/4 hover:text-[#f3efe6]",
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="hidden items-center gap-2 rounded-full border border-white/8 bg-[#1c1c1c] px-4 py-2 text-sm text-[#ece7dd] md:inline-flex"
                >
                  <Lock className="size-4" />
                  Share
                </button>
                <button
                  type="button"
                  className="hidden items-center gap-2 rounded-full bg-[#e7e4dd] px-4 py-2 text-sm font-medium text-[#101010] md:inline-flex"
                >
                  <Share2 className="size-4" />
                  Download Comet
                </button>
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-full text-[#8b867e] transition hover:bg-white/4 hover:text-white"
                >
                  <Ellipsis className="size-5" />
                </button>
              </div>
            </div>
          </header>

          <div ref={scrollAreaRef} onScroll={handleScrollAreaScroll} className="relative min-h-0 flex-1 overflow-y-auto">
            {location.pathname === "/" && !messages.length ? (
              renderBody()
            ) : (
              <div className="pt-4">{renderBody()}</div>
            )}
          </div>

          {!!error && (
            <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4">
              <div className="pointer-events-auto rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-100">
                {error}
              </div>
            </div>
          )}

          {(messages.length > 0 || activeConversationId || isHydratedConversation) && (
            <div className="pointer-events-none z-20 shrink-0 bg-gradient-to-t from-[#111111] via-[#111111]/92 to-transparent px-4 pb-2 pt-4 md:px-8">
              <div className="pointer-events-auto mx-auto max-w-[860px]">
                <Composer onSubmit={submitPrompt} loading={submitting} docked placeholder="Ask a follow-up..." />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
