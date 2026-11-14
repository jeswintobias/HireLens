-- CreateEnum
CREATE TYPE "RecommendationRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "RecommendationRun" (
    "id" TEXT NOT NULL,
    "profileId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "status" "RecommendationRunStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "parsingMs" INTEGER,
    "matchingMs" INTEGER,
    "llmMs" INTEGER,
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "toolTrace" JSONB,
    "parsedResume" JSONB,
    "featureVector" JSONB,
    "scoreBreakdown" JSONB,
    "decision" TEXT,
    "injectionSuspected" BOOLEAN NOT NULL DEFAULT false,
    "injectionSignals" JSONB,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecommendationRun_status_idx" ON "RecommendationRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRun_profileId_version_key" ON "RecommendationRun"("profileId", "version");

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hiringProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
