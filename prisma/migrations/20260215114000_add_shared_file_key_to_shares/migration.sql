-- Add recipient-decryptable file key for shared files
ALTER TABLE "shares"
ADD COLUMN "sharedFileKey" BYTEA;
