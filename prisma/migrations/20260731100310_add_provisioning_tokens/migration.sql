-- CreateTable
CREATE TABLE "ProvisioningToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "employeeId" TEXT,
    "deviceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningToken_tokenHash_key" ON "ProvisioningToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ProvisioningToken_status_idx" ON "ProvisioningToken"("status");

-- CreateIndex
CREATE INDEX "ProvisioningToken_employeeId_idx" ON "ProvisioningToken"("employeeId");
