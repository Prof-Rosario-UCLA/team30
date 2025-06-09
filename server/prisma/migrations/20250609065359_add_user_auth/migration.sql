-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_problems" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageData" TEXT NOT NULL,
    "imageName" TEXT,
    "mimeType" TEXT NOT NULL,
    "question" TEXT,
    "aiResponse" TEXT NOT NULL,
    "rating" TEXT,
    "subject" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER,
    CONSTRAINT "problems_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_problems" ("aiResponse", "createdAt", "id", "imageData", "imageName", "mimeType", "question", "rating", "subject", "updatedAt") SELECT "aiResponse", "createdAt", "id", "imageData", "imageName", "mimeType", "question", "rating", "subject", "updatedAt" FROM "problems";
DROP TABLE "problems";
ALTER TABLE "new_problems" RENAME TO "problems";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
