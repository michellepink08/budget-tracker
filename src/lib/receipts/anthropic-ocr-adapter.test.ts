import { describe, expect, it, vi } from "vitest";
import { AnthropicOcrAdapter } from "@/lib/receipts/anthropic-ocr-adapter";

const createMock = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-sonnet-5",
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function toolResponse(input: unknown) {
  return { content: [{ type: "tool_use", id: "t1", name: "record_receipt", input }] };
}

describe("AnthropicOcrAdapter", () => {
  it("maps a full extraction result", async () => {
    createMock.mockResolvedValueOnce(
      toolResponse({
        store: "SM Supermarket",
        date: "2026-09-13",
        lines: [{ name: "Milk", quantity: 2, unitPrice: 85, lineTotal: 170 }],
        subtotal: 170,
        tax: 0,
        grandTotal: 170,
      }),
    );

    const result = await new AnthropicOcrAdapter().extract(JPEG_HEADER, "image/jpeg");

    expect(result.store).toBe("SM Supermarket");
    expect(result.date).toEqual(new Date("2026-09-13"));
    expect(result.lines).toEqual([{ name: "Milk", quantity: 2, unitPrice: 85, lineTotal: 170 }]);
    expect(result.grandTotal).toBe(170);
  });

  it("sends the sniffed media type when no contentType is given", async () => {
    createMock.mockResolvedValueOnce(toolResponse({ lines: [] }));

    await new AnthropicOcrAdapter().extract(JPEG_HEADER);

    const call = createMock.mock.calls[0][0];
    expect(call.messages[0].content[0].source.media_type).toBe("image/jpeg");
  });

  it("returns empty lines when the model returns no tool_use block", async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "can't read this" }] });

    const result = await new AnthropicOcrAdapter().extract(JPEG_HEADER);

    expect(result).toEqual({ lines: [] });
  });

  it("omits an unparseable date rather than passing through an Invalid Date", async () => {
    createMock.mockResolvedValueOnce(toolResponse({ date: "not a date", lines: [] }));

    const result = await new AnthropicOcrAdapter().extract(JPEG_HEADER);

    expect(result.date).toBeUndefined();
  });
});
