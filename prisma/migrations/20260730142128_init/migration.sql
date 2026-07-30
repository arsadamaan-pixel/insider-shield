-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    "platform" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SystemPolicy_key_key" ON "SystemPolicy"("key");
