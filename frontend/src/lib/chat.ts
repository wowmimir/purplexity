import axios from "axios";

import { BACKEND_URL } from "@/lib/config";

export type ConversationListItem = {
  id: string;
  title: string | null;
  slug: string;
};

export type ChatMessage = {
  id: string;
  role: "User" | "Assistant";
  content: string;
  rawContent?: string;
  createdAt?: string;
  isStreaming?: boolean;
};

export type ConversationDetail = {
  id: string;
  title: string | null;
  slug: string;
  messages: ChatMessage[];
};

export type AnswerSource = {
  url: string;
  title: string;
};

type StreamAnswerEvent = { type: "answer"; token: string };
type StreamFollowUpsEvent = { type: "followUps"; followUps: string[] };
type StreamSourcesEvent = { type: "sources"; sources: AnswerSource[] };
type StreamConversationEvent = { type: "conversation"; conversationId: string; slug: string };
type StreamErrorEvent = { type: "error"; message: string };
type StreamDoneEvent = { type: "done" };

export type StreamEvent =
  | StreamAnswerEvent
  | StreamFollowUpsEvent
  | StreamSourcesEvent
  | StreamConversationEvent
  | StreamErrorEvent
  | StreamDoneEvent;

function authHeaders(token: string) {
  return {
    Authorization: token,
  };
}

export async function fetchConversations(token: string): Promise<ConversationListItem[]> {
  const response = await axios.get<{ conversations: ConversationListItem[] }>(`${BACKEND_URL}/conversations`, {
    headers: authHeaders(token),
  });

  return response.data.conversations;
}

export async function fetchConversation(token: string, conversationId: string): Promise<ConversationDetail> {
  const response = await axios.get<{ conversation: ConversationDetail }>(
    `${BACKEND_URL}/conversations/${conversationId}`,
    {
      headers: authHeaders(token),
    },
  );

  return response.data.conversation;
}

function parseEventBlock(block: string): StreamEvent | null {
  const lines = block.split(/\r?\n/);
  const eventLine = lines.find(line => line.startsWith("event:"));
  const dataLine = lines.find(line => line.startsWith("data:"));

  if (!eventLine || !dataLine) {
    return null;
  }

  const eventName = eventLine.slice("event:".length).trim();
  const payload = JSON.parse(dataLine.slice("data:".length).trim()) as Record<string, unknown>;

  switch (eventName) {
    case "answer":
      return { type: "answer", token: String(payload.token ?? "") };
    case "followUps":
      return {
        type: "followUps",
        followUps: Array.isArray(payload.followUps) ? payload.followUps.map(String) : [],
      };
    case "sources":
      return {
        type: "sources",
        sources: Array.isArray(payload.sources)
          ? payload.sources.map(source => ({
              title: String((source as AnswerSource).title ?? ""),
              url: String((source as AnswerSource).url ?? ""),
            }))
          : [],
      };
    case "conversation":
      return {
        type: "conversation",
        conversationId: String(payload.conversationId ?? ""),
        slug: String(payload.slug ?? ""),
      };
    case "error":
      return { type: "error", message: String(payload.message ?? "Something went wrong") };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

async function streamRequest(
  endpoint: string,
  token: string,
  body: Record<string, string>,
  onEvent: (event: StreamEvent) => void,
) {
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseEventBlock(block.trim());

      if (event) {
        onEvent(event);
      }
    }

    if (done) {
      const finalEvent = parseEventBlock(buffer.trim());
      if (finalEvent) {
        onEvent(finalEvent);
      }
      break;
    }
  }
}

export function streamNewConversation(
  token: string,
  query: string,
  onEvent: (event: StreamEvent) => void,
) {
  return streamRequest("/perplexity-ask", token, { query }, onEvent);
}

export function streamFollowUp(
  token: string,
  conversationId: string,
  query: string,
  onEvent: (event: StreamEvent) => void,
) {
  return streamRequest("/perplexity-ask/follow-up", token, { conversationId, query }, onEvent);
}
