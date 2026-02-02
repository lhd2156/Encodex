import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "../../../../lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // ✅ THIS IS THE FIX

  const file = await prisma.file.findUnique({
    where: { id },
  });

  if (!file) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 }
    );
  }

  const encryptedBytes = await readFile(file.storagePath);

  return NextResponse.json({
    encryptedData: Buffer.from(encryptedBytes).toString("base64"),
    encryptedKey: Buffer.from(file.encryptedKey).toString("base64"),
    iv: Buffer.from(file.iv).toString("base64"),
    salt: Buffer.from(file.salt).toString("base64"),
    filename: file.filename,
    mimeType: file.mimeType,
  });
}
