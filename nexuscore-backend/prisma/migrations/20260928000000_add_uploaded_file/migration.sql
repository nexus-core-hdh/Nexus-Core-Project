-- "UploadedFile" (backs /upload/single + GET /upload/:id) exists in schema.prisma but was only ever
-- created with `prisma db push`, never by a migration, so a fresh database had no table for
-- uploads. DDL is exactly what `prisma migrate diff` generates for the model; IF NOT EXISTS keeps
-- this a no-op on databases that already have the table.
CREATE TABLE IF NOT EXISTS "UploadedFile" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);
