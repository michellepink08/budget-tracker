import { describe, expect, it } from "vitest";
import { StubOcrAdapter } from "@/lib/receipts/ocr-adapter";

describe("StubOcrAdapter", () => {
  it("extracts nothing — every field starts blank for 100% manual entry", async () => {
    const adapter = new StubOcrAdapter();
    const result = await adapter.extract(Buffer.from(""));
    expect(result).toEqual({ lines: [] });
    expect(result.store).toBeUndefined();
    expect(result.date).toBeUndefined();
    expect(result.subtotal).toBeUndefined();
    expect(result.tax).toBeUndefined();
    expect(result.grandTotal).toBeUndefined();
  });
});
