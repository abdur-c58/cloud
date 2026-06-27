import { randomUUID } from "crypto";
import OpenAI from "openai";
import * as db from "../db";
import { config } from "../config";
import { lockingAncestor, folderTokenFromRequest } from "../locks";
import { classify } from "../media";
import * as r2 from "../r2";
import { ApiError, requireUser, unlockedFolders } from "../security";
import { assertOwned, stripUserRoot } from "../user-scope";
import { titleFromMessage } from "./chats";
import { expandSearchTerms } from "../query-terms";
import { visualIndexImage } from "../visual-index";

const SYSTEM_PROMPT =
  "You are the assistant for GigaChad Cloud, a personal media library of the user's own photos, videos and audio stored on Cloudflare R2. Help the user find, organise and understand their files. When the user asks to find or list media, call the search_library tool with short object/scene keywords (e.g. 'car' not 'pictures of cars'). Images are visually indexed — search matches what is IN the photo, not just filenames. Be concise and friendly. Refer to files by name. Never invent files that the tool did not return.";

const SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "search_library",
    description: "Search the user's media library by keyword, type and favorites.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        type: { type: "string", enum: ["image", "video", "audio"] },
        favorites_only: { type: "boolean" },
      },
    },
  },
};

type ChatResult = {
  key: string;
  name: string;
  type: string;
  folder: string;
  tags: string[];
};

async function runSearch(
  userId: string,
  query: string,
  type: string | undefined,
  favorites: boolean,
  folderToken: string | null,
): Promise<ChatResult[]> {
  const rows = await db.searchItems(userId, {
    query,
    types: type ? [type] : undefined,
    favoritesOnly: favorites,
    limit: 30,
  });
  const unlocked = await unlockedFolders(folderToken, userId);
  const locked = await db.listLockedFolders(userId);
  const items: ChatResult[] = [];
  for (const row of rows) {
    const gate = lockingAncestor(row.key, locked);
    if (gate && !unlocked.has(gate)) continue;
    items.push({
      key: stripUserRoot(userId, row.key),
      name: row.name,
      type: row.type,
      folder: stripUserRoot(userId, row.folder),
      tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
    });
  }
  return items;
}

async function keywordFallback(
  userId: string,
  messages: Array<{ role: string; content: string }>,
  folderToken: string | null,
) {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const terms = expandSearchTerms(last);
  const results = await runSearch(userId, last, undefined, false, folderToken);
  if (results.length) {
    const names = results.slice(0, 8).map((r) => r.name).join(", ");
    const hint = terms.length ? ` (matched: ${terms.slice(0, 4).join(", ")})` : "";
    return {
      reply: `I found ${results.length} item(s) matching your request: ${names}.${hint} (Set OPENAI_API_KEY for full conversational answers.)`,
      results,
    };
  }
  return {
    reply: `I couldn't find anything matching your request. Try Reindex to refresh visual tags on photos, or use different keywords. (Set OPENAI_API_KEY for smarter chat.)`,
    results: [] as ChatResult[],
  };
}

async function generateReply(
  userId: string,
  messages: Array<{ role: string; content: string }>,
  folderToken: string | null,
) {
  if (!config.openaiConfigured) {
    return keywordFallback(userId, messages, folderToken);
  }

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];
  let collected: ChatResult[] = [];

  for (let step = 0; step < 4; step++) {
    const completion = await client.chat.completions.create({
      model: config.openaiModel,
      messages: convo,
      tools: [SEARCH_TOOL],
      temperature: 0.3,
    });
    const msg = completion.choices[0]?.message;
    if (!msg?.tool_calls?.length) {
      return { reply: msg?.content || "", results: collected };
    }
    convo.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const args = JSON.parse(call.function.arguments || "{}");
      collected = await runSearch(
        userId,
        args.query || "",
        args.type,
        Boolean(args.favorites_only),
        folderToken,
      );
      convo.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(collected.map((f) => ({ name: f.name, type: f.type }))),
      });
    }
  }
  return { reply: "Here is what I found in your library.", results: collected };
}

export async function handleChat(req: Request) {
  const user = await requireUser(req);
  const ft = folderTokenFromRequest(req);
  const body = await req.json();
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : undefined;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const legacyMessages: Array<{ role: string; content: string }> = body.messages || [];

  if (conversationId) {
    if (!message) throw new ApiError(400, "Message is required.");
    const conversation = await db.getChatConversation(user.userId, conversationId);
    if (!conversation) throw new ApiError(404, "Conversation not found.");

    const history = await db.listChatMessages(user.userId, conversationId);
    const prior = history.map((m) => ({ role: m.role, content: m.content }));
    await db.insertChatMessage(user.userId, conversationId, randomUUID(), "user", message);

    const { reply, results } = await generateReply(user.userId, [...prior, { role: "user", content: message }], ft);
    await db.insertChatMessage(user.userId, conversationId, randomUUID(), "assistant", reply, results);
    await db.touchChatConversation(user.userId, conversationId);

    if (conversation.title === "New chat") {
      await db.updateChatConversation(user.userId, conversationId, titleFromMessage(message));
    }

    return { reply, results, conversation_id: conversationId };
  }

  if (legacyMessages.length) {
    return generateReply(user.userId, legacyMessages, ft);
  }

  throw new ApiError(400, "conversation_id and message are required.");
}

export async function handleSuggestTags(req: Request) {
  const user = await requireUser(req);
  const body = await req.json();
  const key = assertOwned(user.userId, body.key);
  if (classify(key) !== "image") {
    throw new r2.StorageError("Auto-tagging is currently available for images only.");
  }

  const row = await db.getItem(user.userId, key);
  const local = await visualIndexImage(user.userId, key, row?.size ?? null, true);
  if (local.tags.length) {
    const tags = local.tags;
    const caption = tags
      .slice(0, 4)
      .map((t) => t.replace(/_/g, " "))
      .join(", ");
    await db.setTags(user.userId, key, [...new Set(tags)].sort().join(","), caption);
    return { tags, caption, source: "visual" as const };
  }

  if (!config.openaiConfigured) {
    return { tags: [], caption: "", message: "Visual indexing could not classify this image." };
  }
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const url = await r2.presignGet(key, false);
  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Describe this image in one short caption and give 3-8 lowercase tags. Respond as JSON: {"caption": str, "tags": [str]}.',
          },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  let data: { caption?: string; tags?: string[] } = {};
  try {
    data = JSON.parse(completion.choices[0]?.message?.content || "{}");
  } catch {
    data = {};
  }
  const tags = (data.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const caption = String(data.caption || "").trim();
  await db.setTags(user.userId, key, [...new Set(tags)].sort().join(","), caption);
  return { tags, caption, source: "openai" as const };
}
