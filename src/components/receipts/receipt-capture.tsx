"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createDraftReceiptAction,
  runOcrExtractionAction,
  uploadReceiptImageAction,
} from "@/actions/receipt.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Multi-file input + a simple thumbnail strip with remove/reorder — no
// crop/rotate editor (see the design spec's Decision 4: the stub OCR never
// reads pixel data, so that only serves a human re-checking the image
// later, and retaking a clearer photo covers that need without a custom
// canvas-based editor).
export function ReceiptCapture() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [storeName, setStoreName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function moveFile(index: number, direction: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleCreate() {
    setIsSubmitting(true);
    try {
      const draftFormData = new FormData();
      draftFormData.set("storeName", storeName);
      draftFormData.set("purchaseDate", "");
      draftFormData.set("receiptNumber", "");
      const created = await createDraftReceiptAction(draftFormData);
      if (!created.ok) {
        toast.error(created.error);
        return;
      }

      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        const uploadResult = await uploadReceiptImageAction(created.id, formData);
        if (!uploadResult.ok) {
          toast.error(`Failed to upload ${file.name}: ${uploadResult.error}`);
        }
      }

      const extractResult = await runOcrExtractionAction(created.id);
      if (!extractResult.ok) {
        toast.error(extractResult.error);
        return;
      }

      toast.success("Receipt started — enter the details below");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storeName">Store (optional)</Label>
        <Input
          id="storeName"
          placeholder="e.g. SM Supermarket"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="receiptImages">Receipt photos (optional)</Label>
        <input
          id="receiptImages"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFilesSelected}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          No OCR provider is connected yet — photos are stored for reference, but every field below still needs
          manual entry.
        </p>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex flex-col items-center gap-1 rounded-md border p-2">
              <p className="max-w-24 truncate text-xs">{file.name}</p>
              <div className="flex gap-1">
                <Button variant="ghost" size="xs" onClick={() => moveFile(index, -1)} disabled={index === 0}>
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => moveFile(index, 1)}
                  disabled={index === files.length - 1}
                >
                  ↓
                </Button>
                <Button variant="ghost" size="xs" onClick={() => removeFile(index)}>
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button onClick={handleCreate} disabled={isSubmitting}>
        {isSubmitting ? "Starting..." : "Start receipt"}
      </Button>
    </div>
  );
}
