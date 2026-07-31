-- AlterTable
ALTER TABLE "Heartbeat" ADD COLUMN "tokenId" TEXT;

-- CreateIndex
CREATE INDEX "Heartbeat_tokenId_idx" ON "Heartbeat"("tokenId");
