"use client";

import { useState } from "react";
import {
  deriveMasterKey,
  encryptFile,
  wrapFileKey,
} from "@/lib/crypto";

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr));
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleUpload() {
    if (!file || !password) {
      setStatus("Missing file or password");
      return;
    }

    try {
      setStatus("Deriving master key...");

      // TEMP: later this salt comes from user account state
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const masterKey = await deriveMasterKey(password, salt);

      setStatus("Encrypting file...");
      const { encryptedData, fileKey, iv } =
        await encryptFile(file); // ✅ FIXED

      setStatus("Wrapping file key...");
      const wrappedKey = await wrapFileKey(fileKey, masterKey);

      setStatus("Uploading encrypted file...");

      const form = new FormData();
      form.append("file", new Blob([encryptedData]));
      form.append("encryptedKey", toBase64(wrappedKey));
      form.append("iv", toBase64(iv));
      form.append("filename", file.name);
      form.append("mimeType", file.type);
      form.append("salt", toBase64(salt)); // optional but useful later

      const res = await fetch("/api/files", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      setStatus("Upload successful ✅");
      setFile(null);
    } catch (err) {
      console.error(err);
      setStatus("Upload failed ❌");
    }
  }

  return (
    <div className="p-6 max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Upload Encrypted File</h1>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <input
        type="password"
        placeholder="Encryption password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border p-2 rounded"
      />

      <button
        onClick={handleUpload}
        className="px-4 py-2 bg-black text-white rounded"
      >
        Encrypt & Upload
      </button>

      <p className="text-sm">{status}</p>
    </div>
  );
}
