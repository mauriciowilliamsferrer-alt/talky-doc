-- Add OCR text column to document_pages
-- This column stores the text extracted from each scanned page via tesseract.js.
-- It is nullable — pages captured before OCR was introduced, or where OCR fails,
-- will have NULL and are simply excluded from full-text search results.

ALTER TABLE document_pages
  ADD COLUMN IF NOT EXISTS ocr_text text;

-- GIN index for fast full-text search across all pages of a user's documents.
-- We use pg_trgm (trigram) so partial / ilike searches stay fast even on large tables.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS document_pages_ocr_text_trgm_idx
  ON document_pages
  USING gin (ocr_text gin_trgm_ops);
