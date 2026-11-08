-- Catalog owns this extension's schema. Do not silently relocate a shared
-- extension installed by another service; resolve that prerequisite explicitly.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA catalog_service;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'unaccent' AND n.nspname = 'catalog_service'
  ) THEN
    RAISE EXCEPTION 'Catalog search requires unaccent in schema catalog_service; review existing extension placement before rollout';
  END IF;
END
$$;
