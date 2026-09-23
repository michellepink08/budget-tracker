"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { askAssistantAction } from "@/actions/ai-assistant.actions";
import type { ChatMessage } from "@/lib/ai/financial-assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

const EXAMPLES = [
  "How much have I spent on Food this cycle?",
  "How does this cycle's income compare to the last few?",
  "What's my balance across all my accounts?",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);
    setInput("");
    setSending(true);

    const result = await askAssistantAction(trimmed, messages);
    setSending(false);

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: result.ok ? result.reply : `Error: ${result.error}` },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <Card className="p-4">
            <p className="mb-2 text-sm text-muted-foreground">Ask about your own budget, e.g.:</p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="w-fit rounded-md border px-2.5 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => send(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((m, i) => (
          <Card
            key={i}
            variant={m.role === "user" ? undefined : "info"}
            className={`max-w-[85%] p-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "self-end" : "self-start"}`}
          >
            {m.content}
          </Card>
        ))}

        {sending && <p className="text-sm text-muted-foreground">Thinking…</p>}
      </div>

      <form
        className="flex gap-2"
        action={() => send(input)}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask a question about your budget"
          className="min-h-9 flex-1"
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
