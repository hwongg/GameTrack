# GameTrack: autenticación y CRUD

## Configuración
1. Copia el `.env` anterior; agrega `KEYCLOAK_ADMIN=admin` y `KEYCLOAK_ADMIN_PASSWORD` con una contraseña fuerte.
2. No borres el volumen PostgreSQL existente. El servicio de autenticación reutiliza los usuarios existentes.
3. Ejecuta `docker compose up -d --build`.
4. Abre `http://localhost:3000`. Keycloak tarda un poco en iniciar la primera vez.
5. En el diálogo de acceso selecciona **Continuar con Keycloak**. El registro clásico permanece habilitado.
6. Para crear un administrador a partir de un usuario ya registrado: `docker compose exec backend node src/scripts/promote-admin.js correo@ejemplo.com`. Cierra sesión y vuelve a entrar.
7. Como administrador aparecerá **Administrar juegos**, con formulario de creación, edición y eliminación.

## Arquitectura
- `auth-service`: registro, login local, refresh, perfil, OAuth 2.0 / OpenID Connect con Keycloak y emisión de JWT local.
- `backend` y `backend2`: catálogo y biblioteca, validan el JWT firmado por auth-service.
- `ai-service`: recomendaciones ML.
- `keycloak`: proveedor de identidad, no se cuenta como microservicio de negocio.
- `proxy`: Nginx, punto de entrada único.

## Importante
- La configuración OIDC utiliza `localhost:3000`; para otro dominio debes cambiar URLs en `auth-service/src/oidc.js`, Keycloak y CORS.
- Keycloak se ejecuta en modo desarrollo, apropiado para demostración local, NO para producción.
- El primer usuario que inicia sesión con Keycloak se crea como usuario normal. El email debe estar verificado en el proveedor; en el realm de demostración se puede habilitar verificación de email cuando exista SMTP.
- La separación comparte la tabla `usuarios` y secretos JWT para conservar compatibilidad; para producción se recomienda un esquema separado y verificación con claves públicas.
- No se han ejecutado pruebas integradas de Docker en este entorno. Verifica manualmente registro, login, login Keycloak, refresh, CRUD, biblioteca y recomendaciones.
