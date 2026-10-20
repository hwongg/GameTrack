# Actualización de GameTrack

## Implementado en esta actualización
- Ordenamiento de biblioteca por título, horas, estado y fecha.
- Recomendaciones con TF-IDF y similitud del coseno usando scikit-learn.
- Proxy Nginx como entrada única en localhost:3000, con dos instancias backend.
- Protección de Origin en las rutas de refresh/logout que utilizan cookie.
- Script para promover un usuario existente a administrador.
- El frontend utiliza /api relativo al mismo origen.

## Ejecutar
1. Crear `.env` desde `.env.example` y conservar tus claves anteriores en tu entorno local.
2. Configurar `CORS_ORIGIN=http://localhost:3000`.
3. Ejecutar `docker compose up -d --build`.
4. Abrir http://localhost:3000.
5. Para promover un usuario registrado: `docker compose exec backend node src/scripts/promote-admin.js usuario@ejemplo.com`.

## Pendiente; NO se considera implementado
- OAuth 2.0 y OpenID Connect con proveedor real.
- Microservicio de autenticación separado.
- Formulario de CRUD manual para juegos en React.
- Portadas oficiales diferenciadas por plataforma (dependen de datos disponibles en el proveedor).
- Pruebas reales en móviles, carga, failover y alta disponibilidad integral.
- CSRF con token explícito; actualmente se valida Origin en rutas de cookies, y se mantiene SameSite.

## Precauciones
- No se incluye `.env` por contener credenciales.
- Dos backends sincronizan Sequelize al iniciar; para producción se recomiendan migraciones ejecutadas una sola vez.
- Las dos instancias comparten la misma base de datos, que continúa siendo punto único de fallo.
- Revisa los logs y prueba el despliegue antes de entregar el proyecto.
