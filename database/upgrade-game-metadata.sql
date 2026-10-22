-- Ejecutar una sola vez en PostgreSQL existente; no elimina juegos ni bibliotecas.
ALTER TABLE juegos ADD COLUMN IF NOT EXISTS developer VARCHAR(200);
ALTER TABLE juegos ADD COLUMN IF NOT EXISTS publisher VARCHAR(200);
ALTER TABLE juegos ADD COLUMN IF NOT EXISTS screenshots JSONB NOT NULL DEFAULT '[]'::jsonb;
