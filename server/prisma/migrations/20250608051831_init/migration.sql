-- CreateTable
CREATE TABLE "problems" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageData" TEXT NOT NULL,
    "imageName" TEXT,
    "mimeType" TEXT NOT NULL,
    "question" TEXT,
    "aiResponse" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
