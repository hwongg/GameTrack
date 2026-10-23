-- Actualización segura para instalaciones existentes de GameTrack.
-- Ejecutar una sola vez si se desea aplicar la migración manualmente.
-- No borra registros ni modifica las bibliotecas de usuarios.
-- La columna admite NULL para los juegos existentes/importados de RAWG.
-- La fecha es opcional al crear y editar juegos; si se indica, se valida en la API.
ALTER TABLE IF EXISTS juegos ADD COLUMN IF NOT EXISTS release_date DATE;
