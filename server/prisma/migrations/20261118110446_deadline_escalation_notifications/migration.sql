-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipientId" INTEGER NOT NULL,
    "requestId" INTEGER,
    "type" TEXT NOT NULL,
    "stage" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "actorId" INTEGER,
    "actionType" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ActivityLog" ("actionType", "actorId", "createdAt", "description", "fieldName", "id", "newValue", "oldValue", "requestId") SELECT "actionType", "actorId", "createdAt", "description", "fieldName", "id", "newValue", "oldValue", "requestId" FROM "ActivityLog";
DROP TABLE "ActivityLog";
ALTER TABLE "new_ActivityLog" RENAME TO "ActivityLog";
CREATE INDEX "ActivityLog_requestId_createdAt_idx" ON "ActivityLog"("requestId", "createdAt");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "referenceNumber" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterContact" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "priorityRank" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "resolvedById" INTEGER,
    "resolvedAt" DATETIME,
    "dueAt" DATETIME,
    "escalateTo" TEXT,
    "escalatedPriority" TEXT,
    "escalatedAt" DATETIME,
    "deadlineState" TEXT,
    "deadlineCycle" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("assignedToId", "category", "clientRequestId", "createdAt", "createdById", "description", "dueAt", "escalateTo", "escalatedAt", "id", "priority", "priorityRank", "referenceNumber", "requesterContact", "requesterName", "resolvedAt", "resolvedById", "source", "status", "title", "updatedAt", "version") SELECT "assignedToId", "category", "clientRequestId", "createdAt", "createdById", "description", "dueAt", "escalateTo", "escalatedAt", "id", "priority", "priorityRank", "referenceNumber", "requesterContact", "requesterName", "resolvedAt", "resolvedById", "source", "status", "title", "updatedAt", "version" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE UNIQUE INDEX "Request_referenceNumber_key" ON "Request"("referenceNumber");
CREATE UNIQUE INDEX "Request_clientRequestId_key" ON "Request"("clientRequestId");
CREATE INDEX "Request_status_idx" ON "Request"("status");
CREATE INDEX "Request_assignedToId_status_idx" ON "Request"("assignedToId", "status");
CREATE INDEX "Request_priorityRank_idx" ON "Request"("priorityRank");
CREATE INDEX "Request_createdAt_idx" ON "Request"("createdAt");
CREATE INDEX "Request_updatedAt_idx" ON "Request"("updatedAt");
CREATE INDEX "Request_dueAt_idx" ON "Request"("dueAt");
CREATE INDEX "Request_category_idx" ON "Request"("category");
CREATE INDEX "Request_deadlineState_idx" ON "Request"("deadlineState");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");

