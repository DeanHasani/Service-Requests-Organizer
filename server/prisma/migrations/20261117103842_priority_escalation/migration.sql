-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "referenceNumber" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterContact" TEXT NOT NULL,
    "source" TEXT NOT NULL,
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
    "escalatedAt" DATETIME,
    "escalationById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_escalationById_fkey" FOREIGN KEY ("escalationById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("assignedToId", "clientRequestId", "createdAt", "createdById", "description", "dueAt", "id", "priority", "priorityRank", "referenceNumber", "requesterContact", "requesterName", "resolvedAt", "resolvedById", "source", "status", "title", "updatedAt", "version") SELECT "assignedToId", "clientRequestId", "createdAt", "createdById", "description", "dueAt", "id", "priority", "priorityRank", "referenceNumber", "requesterContact", "requesterName", "resolvedAt", "resolvedById", "source", "status", "title", "updatedAt", "version" FROM "Request";
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
