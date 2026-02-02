import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const file = form.get("file") as File;
  const encryptedKey = form.get("encryptedKey") as string;
  const iv = form.get("iv") as string;
  const salt = form.get("salt") as string;
  const filename = form.get("filename") as string;
  const mimeType = form.get("mimeType") as string;

  if (!file || !encryptedKey || !iv || !salt) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const storageDir = path.join(process.cwd(), "storage");
  await mkdir(storageDir, { recursive: true });

  const storageName = crypto.randomUUID();
  const storagePath = path.join(storageDir, storageName);

  await writeFile(storagePath, buffer);

  const record = await prisma.file.create({
    data: {
      ownerId: "TODO-auth",
      filename,
      mimeType,
      size: buffer.length,
      encryptedKey: Buffer.from(encryptedKey, "base64"),
      iv: Buffer.from(iv, "base64"),
      salt: Buffer.from(salt, "base64"),
      storagePath,
    },
  });

  return NextResponse.json({ fileId: record.id });
}
