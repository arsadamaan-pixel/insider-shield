-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "managedDeviceId" TEXT,
    "lastSeenAt" DATETIME,
    "lastKnownIp" TEXT,
    "offboardedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DlpAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL,
    "employeeEmail" TEXT NOT NULL,
    "ruleTriggered" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "redactedContent" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "geoViolation" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "SystemPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Heartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgKey" TEXT NOT NULL,
    "employeeEmail" TEXT,
    "ipAddress" TEXT,
    "platform" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetResource" TEXT NOT NULL,
    "detailsJson" TEXT,
    "ipAddress" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_managedDeviceId_key" ON "Employee"("managedDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemPolicy_key_key" ON "SystemPolicy"("key");

-- CreateIndex
CREATE INDEX "Heartbeat_employeeEmail_idx" ON "Heartbeat"("employeeEmail");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

