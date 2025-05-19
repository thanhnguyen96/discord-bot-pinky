-- CreateTable
CREATE TABLE "channelSettings" (
    "channelId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channelSettings_pkey" PRIMARY KEY ("channelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "channelSettings_channelId_key" ON "channelSettings"("channelId");
