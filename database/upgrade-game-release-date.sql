-- Actualización segura para instalaciones existentes de GameTrack.
-- Ejecutar una sola vez si se desea aplicar la migración manualmente.
-- No borra registros ni modifica las bibliotecas de usuarios.
-- La columna admite NULL para los juegos existentes/importados de RAWG.
-- La API exige la fecha al CREAR un juego manualmente como administrador.
ALTER TABLE IF EXISTS juegos ADD COLUMN IF NOT EXISTS release_date DATE;
