import { isAiEnabled } from "@/lib/ai/client";
import { AssistantChat } from "@/components/ai/assistant-chat";
import { Card } from "@/components/ui/card";

export default async function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Assistant</h1>

      {isAiEnabled() ? (
        <AssistantChat />
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">
          The assistant isn&apos;t configured yet — set <code>ANTHROPIC_API_KEY</code> to enable it.
        </Card>
      )}
    </div>
  );
}
