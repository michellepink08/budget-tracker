export type OcrResult = {
  store?: string;
  date?: Date;
  lines: { name: string; quantity?: number; unitPrice?: number; lineTotal: number }[];
  subtotal?: number;
  tax?: number;
  grandTotal?: number;
};

export interface OcrAdapter {
  extract(imageBuffer: Buffer): Promise<OcrResult>;
}

// Ships first, and can stay indefinitely — no network call, no API key,
// nothing to approve. The review screen works identically whether an
// adapter pre-fills nothing (this) or pre-fills everything (a future real
// adapter): it's the same form either way, just starting from different
// default values.
export class StubOcrAdapter implements OcrAdapter {
  async extract(_imageBuffer: Buffer): Promise<OcrResult> {
    return { lines: [] };
  }
}
