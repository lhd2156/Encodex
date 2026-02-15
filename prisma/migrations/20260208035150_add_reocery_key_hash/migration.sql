/*
  Warnings:

  - You are about to drop the `File` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "File";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "salt" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recoveryKeyHash" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT,
    "name" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "type" TEXT,
    "mimeType" TEXT,
    "encryptedData" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "wrappedKey" BYTEA NOT NULL,
    "parentFolderId" TEXT,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT,
    "fileType" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "parentFolderId" TEXT,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permissions" TEXT DEFAULT 'view',

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hidden_shares" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiver_trashed_shares" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "trashedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "receiver_trashed_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temp_deleted_shares" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "deletedByOwnerAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temp_deleted_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "files_userId_idx" ON "files"("userId");

-- CreateIndex
CREATE INDEX "files_ownerEmail_idx" ON "files"("ownerEmail");

-- CreateIndex
CREATE INDEX "files_parentFolderId_idx" ON "files"("parentFolderId");

-- CreateIndex
CREATE INDEX "files_isDeleted_idx" ON "files"("isDeleted");

-- CreateIndex
CREATE INDEX "shares_recipientEmail_idx" ON "shares"("recipientEmail");

-- CreateIndex
CREATE INDEX "shares_fileId_idx" ON "shares"("fileId");

-- CreateIndex
CREATE INDEX "hidden_shares_recipientEmail_idx" ON "hidden_shares"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "hidden_shares_fileId_recipientEmail_key" ON "hidden_shares"("fileId", "recipientEmail");

-- CreateIndex
CREATE INDEX "receiver_trashed_shares_recipientEmail_idx" ON "receiver_trashed_shares"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "receiver_trashed_shares_fileId_recipientEmail_key" ON "receiver_trashed_shares"("fileId", "recipientEmail");

-- CreateIndex
CREATE INDEX "temp_deleted_shares_recipientEmail_idx" ON "temp_deleted_shares"("recipientEmail");

-- CreateIndex
CREATE INDEX "temp_deleted_shares_fileId_idx" ON "temp_deleted_shares"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "temp_deleted_shares_fileId_recipientEmail_key" ON "temp_deleted_shares"("fileId", "recipientEmail");

-- CreateIndex
CREATE INDEX "user_favorites_userEmail_idx" ON "user_favorites"("userEmail");

-- CreateIndex
CREATE INDEX "user_favorites_fileId_idx" ON "user_favorites"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorites_fileId_userEmail_key" ON "user_favorites"("fileId", "userEmail");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
