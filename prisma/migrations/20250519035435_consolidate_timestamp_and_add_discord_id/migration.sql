/*
  Warnings:

  - A unique constraint covering the columns `[channelId,discordMessageId]` on the table `chatHistories` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `discordMessageId` to the `chatHistories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "chatHistories" ADD COLUMN     "discordMessageId" TEXT NOT NULL,
ALTER COLUMN "createdAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "chatHistories_createdAt_idx" ON "chatHistories"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "chatHistories_channelId_discordMessageId_key" ON "chatHistories"("channelId", "discordMessageId");
