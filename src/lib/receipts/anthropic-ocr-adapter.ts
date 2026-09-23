import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import type { OcrAdapter, OcrResult } from "@/lib/receipts/ocr-adapter";

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const SUPPORTED_MEDIA_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Blob storage's reported contentType is trusted first when it's one of
// the four types the API accepts; magic-byte sniffing is the fallback for
// callers (or storage backends) that don't supply a reliable contentType.
function sniffMediaType(buffer: Buffer): SupportedMediaType | null {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function toSupportedMediaType(buffer: Buffer, contentType: string | undefined): SupportedMediaType {
  if (SUPPORTED_MEDIA_TYPES.includes(contentType ?? "")) return contentType as SupportedMediaType;
  return sniffMediaType(buffer) ?? "image/jpeg";
}

type ExtractedReceipt = {
  store?: string;
  date?: string;
  lines: { name: string; quantity?: number; unitPrice?: number; lineTotal: number }[];
  subtotal?: number;
  tax?: number;
  grandTotal?: number;
};

export class AnthropicOcrAdapter implements OcrAdapter {
  async extract(imageBuffer: Buffer, contentType?: string): Promise<OcrResult> {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1536,
      tools: [
        {
          name: "record_receipt",
          description: "Record the fields extracted from a photo of a store receipt.",
          input_schema: {
            type: "object",
            properties: {
              store: { type: "string" },
              date: { type: "string", description: "ISO 8601 date (YYYY-MM-DD)." },
              lines: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "number" },
                    unitPrice: { type: "number" },
                    lineTotal: { type: "number" },
                  },
                  required: ["name", "lineTotal"],
                },
              },
              subtotal: { type: "number" },
              tax: { type: "number" },
              grandTotal: { type: "number" },
            },
            required: ["lines"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "record_receipt" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: toSupportedMediaType(imageBuffer, contentType),
                data: imageBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Extract the store name, date, line items (name/quantity/unit price/line total), subtotal, tax, and grand total from this receipt photo. Omit any field you can't read confidently — never guess.",
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find((block): block is ToolUseBlock => block.type === "tool_use");
    if (!toolUse) return { lines: [] };

    const input = toolUse.input as Partial<ExtractedReceipt>;
    const date = input.date ? new Date(input.date) : undefined;

    return {
      store: input.store,
      date: date && !Number.isNaN(date.getTime()) ? date : undefined,
      lines: Array.isArray(input.lines) ? input.lines : [],
      subtotal: input.subtotal,
      tax: input.tax,
      grandTotal: input.grandTotal,
    };
  }
}
