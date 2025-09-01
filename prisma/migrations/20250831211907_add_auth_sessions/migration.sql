-- CreateTable
CREATE TABLE "AuthSessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "AuthSessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSessions_token_key" ON "AuthSessions"("token");

-- CreateIndex
CREATE INDEX "AuthSessions_userId_idx" ON "AuthSessions"("userId");

-- CreateIndex
CREATE INDEX "AuthSessions_expiresAt_idx" ON "AuthSessions"("expiresAt");
