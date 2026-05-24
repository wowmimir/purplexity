import express, { type Request, type Response } from 'express';
import { tavily } from '@tavily/core';
import dotenv from 'dotenv';
import { SYSTEM_PROMPT, PROMPT_TEMPLATE } from './prompt';
import ollama from 'ollama';
import { z } from 'zod';
import { prisma } from './db';
import { middleware } from './middleware';
import cors from 'cors';

dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────

declare module 'express-serve-static-core' {
    interface Request {
        userId?: string;
    }
}

const ResponseSchema = z.object({
    answer: z.string(),
    followUps: z.array(z.string()),
});

type SearchResult = { url: string; title: string; content?: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
    const base = text
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'chat';
    return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildSearchContext(results: SearchResult[]): string {
    return results
        .map((result, index) =>
            `SOURCE ${index + 1}\nTITLE: ${result.title}\nURL: ${result.url}\nCONTENT:\n${result.content?.slice(0, 1200) ?? ''}`
        )
        .join('\n\n');
}

function buildPrompt(searchContext: string, query: string): string {
    return PROMPT_TEMPLATE
        .replace('{{WEB_SEARCH_RESULTS}}', searchContext)
        .replace('{{USER_QUERY}}', query);
}

function sseEvent(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function setSseHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
}

function unescapeJsonStringFragment(value: string): string {
    return value
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ');
}

function extractJsonStringFragment(raw: string, key: string): string | null {
    const keyIndex = raw.indexOf(`"${key}"`);

    if (keyIndex === -1) {
        return null;
    }

    const colonIndex = raw.indexOf(':', keyIndex);
    const firstQuoteIndex = raw.indexOf('"', colonIndex + 1);

    if (colonIndex === -1 || firstQuoteIndex === -1) {
        return '';
    }

    let escaped = false;
    let output = '';

    for (let index = firstQuoteIndex + 1; index < raw.length; index += 1) {
        const char = raw[index];

        if (escaped) {
            output += `\\${char}`;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (char === '"') {
            break;
        }

        output += char;
    }

    return unescapeJsonStringFragment(output);
}

async function streamOllamaResponse(
    res: Response,
    messages: { role: string; content: string }[]
): Promise<string> {
    const stream = await ollama.chat({
        model: 'gemma4:31b-cloud',
        stream: true,
        messages,
        options: { temperature: 0 },
    });

    let fullResponse = '';
    let streamedAnswer = '';
    for await (const chunk of stream) {
        const token = chunk.message.content;
        fullResponse += token;
        const answerFragment = extractJsonStringFragment(fullResponse, 'answer');

        if (answerFragment !== null && answerFragment.length > streamedAnswer.length) {
            const nextToken = answerFragment.slice(streamedAnswer.length);
            streamedAnswer = answerFragment;
            sseEvent(res, 'answer', { token: nextToken });
        }
    }
    return fullResponse;
}

function parseModelResponse(raw: string) {
    // Gemma sometimes wraps output in ```json ... ``` despite instructions
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return ResponseSchema.parse(JSON.parse(cleaned));
}

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const PORT = 3001;
const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

app.use(express.json());
app.use(cors());

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /perplexity-ask
 * Starts a new conversation: web-searches the query, streams an answer,
 * then emits followUps and sources. Persists everything to the DB.
 */
app.post('/perplexity-ask', middleware, async (req: Request, res: Response) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
    }

    setSseHeaders(res);

    try {
        // 1. Web search
        const searchResponse = await tavilyClient.search(query, { searchDepth: 'advanced' });
        const searchResults: SearchResult[] = searchResponse.results;

        // 2. Build prompt and stream response
        const searchContext = buildSearchContext(searchResults);
        const userPrompt = buildPrompt(searchContext, query);

        const fullResponse = await streamOllamaResponse(res, [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ]);

        // 3. Parse structured output
        let parsed: z.infer<typeof ResponseSchema>;
        try {
            parsed = parseModelResponse(fullResponse);
        } catch (e) {
            console.error('Failed to parse model response:', e);
            sseEvent(res, 'done', {});
            res.end();
            return;
        }

        const sources = searchResults.map(r => ({ url: r.url, title: r.title }));

        sseEvent(res, 'followUps', { followUps: parsed.followUps });
        sseEvent(res, 'sources', { sources });

        // 4. Persist to DB
        const slug = slugify(query);
        const conversation = await prisma.conversation.create({
            data: {
                userId: req.userId!,
                title: query.slice(0, 100),
                slug,
                messages: {
                    create: [
                        { role: 'User', content: query },
                        { role: 'Assistant', content: parsed.answer },
                    ],
                },
            },
            select: { id: true, slug: true },
        });

        sseEvent(res, 'conversation', { conversationId: conversation.id, slug: conversation.slug });
    } catch (e) {
        console.error('Error in /perplexity-ask:', e);
        sseEvent(res, 'error', { message: 'Something went wrong' });
    } finally {
        sseEvent(res, 'done', {});
        res.end();
    }
});

/**
 * POST /perplexity-ask/follow-up
 * Continues an existing conversation. Loads full history from the DB,
 * injects it as conversation context, and streams the follow-up answer.
 */
app.post('/perplexity-ask/follow-up', middleware, async (req: Request, res: Response) => {
    const { conversationId, query } = req.body;

    if (!conversationId || typeof conversationId !== 'string') {
        return res.status(400).json({ error: 'conversationId is required' });
    }
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
    }

    setSseHeaders(res);

    try {
        // 1. Load conversation + history
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: req.userId },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });

        if (!conversation) {
            res.status(404).json({ message: 'Conversation not found' });
            return;
        }

        // 2. Web search for the follow-up query
        const searchResponse = await tavilyClient.search(query, { searchDepth: 'advanced' });
        const searchResults: SearchResult[] = searchResponse.results;
        const searchContext = buildSearchContext(searchResults);

        // 3. Build message history for the model
        //    Reconstruct prior turns from DB so the model has full context.
        // Map DB enum (User/Assistant) → ollama expected lowercase
        const history = conversation.messages.map(msg => ({
            role: msg.role === 'User' ? 'user' : 'assistant',
            content: msg.content,
        }));

        const followUpPrompt = buildPrompt(searchContext, query);

        const messages = [
            { role: 'system' as const, content: SYSTEM_PROMPT },
            ...history,
            { role: 'user' as const, content: followUpPrompt },
        ];

        // 4. Stream response
        const fullResponse = await streamOllamaResponse(res, messages);

        // 5. Parse and emit structured fields
        let parsed: z.infer<typeof ResponseSchema>;
        try {
            parsed = parseModelResponse(fullResponse);
        } catch (e) {
            console.error('Failed to parse follow-up model response:', e);
            sseEvent(res, 'done', {});
            res.end();
            return;
        }

        const sources = searchResults.map(r => ({ url: r.url, title: r.title }));

        sseEvent(res, 'followUps', { followUps: parsed.followUps });
        sseEvent(res, 'sources', { sources });

        // 6. Persist new messages
        await prisma.message.createMany({
            data: [
                { conversationId, role: 'User', content: query },
                { conversationId, role: 'Assistant', content: parsed.answer },
            ],
        });
    } catch (e) {
        console.error('Error in /perplexity-ask/follow-up:', e);
        sseEvent(res, 'error', { message: 'Something went wrong' });
    } finally {
        sseEvent(res, 'done', {});
        res.end();
    }
});

/**
 * GET /conversations
 * Returns a list of all conversations for the authenticated user.
 */
app.get('/conversations', middleware, async (req: Request, res: Response) => {
    try {
        const conversations = await prisma.conversation.findMany({
            where: { userId: req.userId },
            select: { id: true, title: true, slug: true },
        });
        res.json({ conversations });
    } catch (e) {
        console.error('Error in GET /conversations:', e);
        res.status(500).json({ message: 'Failed to fetch conversations' });
    }
});

/**
 * GET /conversations/:conversationId
 * Returns a single conversation with its full message history.
 */
app.get('/conversations/:conversationId', middleware, async (req: Request, res: Response) => {
    const conversationId = req.params.conversationId;


    if (!conversationId || Array.isArray(conversationId)) {
        return res.status(400).json({ message: 'Invalid conversationId' });
    }
    try {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, userId: req.userId },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });

        if (!conversation) {
            res.status(404).json({ message: 'Conversation not found' });
            return;
        }

        res.json({ conversation });
    } catch (e) {
        console.error('Error in GET /conversations/:id:', e);
        res.status(500).json({ message: 'Failed to fetch conversation' });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
