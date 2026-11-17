-- AlterTable
ALTER TABLE "Request" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "Request_category_idx" ON "Request"("category");
