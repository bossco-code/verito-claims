"use node";

/**
 * Amazon refresh-token encryption (spec §9, §33) — staging copy for restore.
 * Refresh tokens are stored ONLY encrypted at rest — AES-256-GCM — and never
 * exposed to the browser. Key comes from AMAZON_TOKEN_ENCRYPTION_KEY.
 * Ciphertext: base64( iv(12) || authTag(16) || ciphertext ).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(key: string): Buffer {
  return createHash("sha256").update(key, "utf8").digest();
}

export function encryptToken(plaintext: string, key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(ciphertext: string, key: string): string {
  const raw = Buffer.from(ciphertext, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Invalid encrypted token payload.");
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
