"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatConversation, ChatReply, StoredChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icons";
import { ChatMarkdown } from "./ChatMarkdown";
import { ChatResultPreview } from "./ChatResultPreview";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  results?: ChatReply["results"];
};

function toDisplay(messages: StoredChatMessage[]): DisplayMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      results: m.results ?? undefined,
    }));
}

const PANEL_TRANSITION = { type: "spring" as const, damping: 30, stiffness: 340, mass: 0.85 };

export function ChatPanel({
  open,
  onClose,
  aiEnabled,
  onOpenResult,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onOpenResult: (key: string, type: string) => void;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 36), 160);
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, open, adjustTextareaHeight]);

  const loadConversations = useCallback(async () => {
    const { conversations: list } = await api.listChats();
    setConversations(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const detail = await api.getChat(id);
    setMessages(toDisplay(detail.messages));
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== detail.conversation.id);
      return [detail.conversation, ...next];
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setBooting(true);
      try {
        const list = await loadConversations();
        if (cancelled) return;
        if (list.length > 0) {
          setActiveId(list[0].id);
          await loadMessages(list[0].id);
        } else {
          const { conversation } = await api.createChat();
          if (cancelled) return;
          setConversations([conversation]);
          setActiveId(conversation.id);
          setMessages([]);
        }
      } catch {
        if (!cancelled) {
          setConversations([]);
          setActiveId(null);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loadConversations, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const selectConversation = async (id: string) => {
    if (id === activeId || loading) return;
    setActiveId(id);
    setInput("");
    try {
      await loadMessages(id);
    } catch {
      setMessages([]);
    }
  };

  const startNewChat = async () => {
    if (loading) return;
    try {
      const { conversation } = await api.createChat();
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
      setMessages([]);
      setInput("");
    } catch {
      /* ignore */
    }
  };

  const deleteActiveChat = async () => {
    if (!activeId || loading) return;
    const id = activeId;
    try {
      await api.deleteChat(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        await loadMessages(remaining[0].id);
      } else {
        const { conversation } = await api.createChat();
        setConversations([conversation]);
        setActiveId(conversation.id);
        setMessages([]);
      }
    } catch {
      /* ignore */
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !activeId) return;

    const tempUserId = `temp-${Date.now()}`;
    const optimistic: DisplayMessage[] = [...messages, { id: tempUserId, role: "user", content: text }];
    setMessages(optimistic);
    setInput("");
    setLoading(true);

    try {
      const reply = await api.chat(activeId, text);
      setMessages([
        ...optimistic,
        { id: `temp-${Date.now()}-a`, role: "assistant", content: reply.reply, results: reply.results },
      ]);
      setConversations((prev) => {
        const current = prev.find((c) => c.id === activeId);
        if (!current) return prev;
        const title =
          current.title === "New chat" ? text.trim().slice(0, 48) + (text.length > 48 ? "…" : "") : current.title;
        const updated = { ...current, title, updated_at: Math.floor(Date.now() / 1000) };
        return [updated, ...prev.filter((c) => c.id !== activeId)];
      });
    } catch (e) {
      setMessages([
        ...optimistic,
        {
          id: `temp-${Date.now()}-e`,
          role: "assistant",
          content: e instanceof Error ? e.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "Assistant";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[85] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close assistant"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.aside
            className="relative flex h-full w-[min(100vw,560px)] border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={PANEL_TRANSITION}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Conversation list */}
            <div className="flex w-[168px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-raised)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Chats</p>
                <button
                  onClick={startNewChat}
                  className="btn-ghost rounded-lg p-1 transition-opacity hover:opacity-80"
                  aria-label="New chat"
                  disabled={loading || booting}
                >
                  <Icon.Plus size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {booting && conversations.length === 0 && (
                  <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c.id)}
                    className={cn(
                      "mb-1 w-full truncate rounded-[var(--radius)] px-2.5 py-2 text-left text-xs transition-all duration-150",
                      c.id === activeId
                        ? "bg-[var(--surface)] text-[var(--foreground)]"
                        : "text-muted-foreground hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
                    )}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Active chat */}
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)]">
                    <Icon.Sparkles size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{activeTitle}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {aiEnabled ? "Ask about your library" : "Keyword search mode"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {activeId && (
                    <button
                      onClick={deleteActiveChat}
                      className="btn-ghost rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-[var(--danger)]"
                      aria-label="Delete chat"
                      disabled={loading || booting}
                    >
                      <Icon.Trash size={16} />
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="btn-ghost rounded-lg p-1.5 transition-opacity hover:opacity-80"
                    aria-label="Close"
                  >
                    <Icon.X size={18} />
                  </button>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
                {booting ? (
                  <p className="mt-6 text-center text-sm text-muted-foreground">Loading conversation…</p>
                ) : messages.length === 0 ? (
                  <div className="mt-6 text-center">
                    <p className="text-sm text-muted-foreground">Try asking:</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {["Find my videos", "Show favorite photos", "What audio do I have?"].map((s) => (
                        <button
                          key={s}
                          onClick={() => setInput(s)}
                          className="btn btn-surface mx-auto !py-1.5 text-xs transition-all duration-150 hover:opacity-90"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] animate-pop-in rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "rounded-br-md bg-[var(--primary)] text-[var(--primary-fg)]"
                            : "rounded-bl-md bg-[var(--surface-raised)] text-[var(--foreground)]"
                        }`}
                      >
                        {m.role === "assistant" ? (
                          <ChatMarkdown content={m.content} />
                        ) : (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        )}
                        {m.results && m.results.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {m.results.slice(0, 8).map((r) => (
                              <ChatResultPreview
                                key={r.key}
                                result={r}
                                onOpen={() => onOpenResult(r.key, r.type)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {loading && (
                  <div className="flex justify-start">
                    <div className="flex gap-1 rounded-2xl rounded-bl-md bg-[var(--surface-raised)] px-4 py-3">
                      <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border)] p-3 safe-pb">
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder="Ask anything…"
                    disabled={!activeId || booting}
                    className="max-h-40 min-h-9 flex-1 resize-none overflow-y-auto !py-2 leading-relaxed"
                  />
                  <Button
                    onClick={send}
                    disabled={!input.trim() || loading || !activeId || booting}
                    size="icon"
                    className="shrink-0 transition-opacity hover:opacity-90"
                  >
                    <Icon.Send size={18} />
                  </Button>
                </div>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="h-2 w-2 rounded-full bg-muted-foreground/60"
      style={{ animation: `pop-in 0.6s ease ${delay}s infinite alternate` }}
    />
  );
}
