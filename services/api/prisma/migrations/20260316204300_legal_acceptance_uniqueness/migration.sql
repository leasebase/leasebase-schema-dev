-- CreateIndex (unique constraint for idempotency — prevents duplicate acceptance rows)
CREATE UNIQUE INDEX "LegalAcceptance_userId_documentSlug_documentVersion_source_key"
  ON "LegalAcceptance"("userId", "documentSlug", "documentVersion", "source");
