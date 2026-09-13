import { del, get, put } from "@vercel/blob";

// The only file that imports @vercel/blob — swapping storage providers
// later means changing just this file. Requires BLOB_READ_WRITE_TOKEN to
// be set (a Blob store provisioned in the Vercel project dashboard); an
// upload fails with a clear error until that's configured.
//
// access: "private" here is a genuine authenticated-read mode (verified
// against the installed @vercel/blob version, not assumed) — a private
// blob's pathname alone does not grant access; reading it back requires
// this server's BLOB_READ_WRITE_TOKEN via getReceiptImageUrl below.
export async function uploadReceiptImage(userId: string, receiptId: string, file: File): Promise<string> {
  const blob = await put(`receipts/${userId}/${receiptId}/${crypto.randomUUID()}-${file.name}`, file, {
    access: "private",
    addRandomSuffix: false,
  });
  return blob.pathname;
}

export async function deleteReceiptImage(objectKey: string): Promise<void> {
  await del(objectKey);
}

export async function getReceiptImageUrl(objectKey: string): Promise<string> {
  const result = await get(objectKey, { access: "private" });
  if (!result) throw new Error("Receipt image not found");
  return result.blob.url;
}
