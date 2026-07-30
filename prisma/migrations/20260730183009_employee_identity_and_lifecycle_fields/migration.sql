-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "lastKnownIp" TEXT;
ALTER TABLE "Employee" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "Employee" ADD COLUMN "managedDeviceId" TEXT;
ALTER TABLE "Employee" ADD COLUMN "offboardedAt" DATETIME;
ALTER TABLE "Employee" ADD COLUMN "title" TEXT;

-- AlterTable
ALTER TABLE "Heartbeat" ADD COLUMN "employeeEmail" TEXT;
ALTER TABLE "Heartbeat" ADD COLUMN "ipAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_managedDeviceId_key" ON "Employee"("managedDeviceId");

-- CreateIndex
CREATE INDEX "Heartbeat_employeeEmail_idx" ON "Heartbeat"("employeeEmail");

