export type OcrResult = {
  store?: string;
  date?: Date;
  lines: { name: string; quantity?: number; unitPrice?: number; lineTotal: number }[];
  subtotal?: number;
  tax?: number;
  grandTotal?: number;
};

export interface OcrAdapter {
  extract(imageBuffer: Buffer, contentType?: string): Promise<OcrResult>;
}

// Ships first, and can stay indefinitely — no network call, no API key,
// nothing to approve. The review screen works identically whether an
// adapter pre-fills nothing (this) or pre-fills everything (a future real
// adapter): it's the same form either way, just starting from different
// default values.
export class StubOcrAdapter implements OcrAdapter {
  async extract(_imageBuffer: Buffer, _contentType?: string): Promise<OcrResult> {
    return { lines: [] };
  }
}

// The real adapter needs ANTHROPIC_API_KEY; this file can't import it
// unconditionally without turning every OCR-adjacent module into one that
// requires @anthropic-ai/sdk to resolve, so the swap happens here via a
// dynamic import instead of a static one.
export async function getOcrAdapter(): Promise<OcrAdapter> {
  const { isAiEnabled } = await import("@/lib/ai/client");
  if (!isAiEnabled()) return new StubOcrAdapter();
  const { AnthropicOcrAdapter } = await import("@/lib/receipts/anthropic-ocr-adapter");
  return new AnthropicOcrAdapter();
}
