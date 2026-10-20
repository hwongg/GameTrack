# Cierre de sesión completo con Keycloak

El botón Cerrar sesión ahora elimina la sesión local y redirige al endpoint de cierre de sesión de Keycloak con `id_token_hint`. La aplicación guarda temporalmente el ID token en una cookie HttpOnly, no accesible por JavaScript.

## Configuración necesaria en Keycloak

Como el realm ya fue importado, modificar `realm.json` no actualiza automáticamente un realm existente. En la consola de administración, selecciona `gametrack` > Clients > `gametrack-web` > Settings > Logout settings y configura **Valid post logout redirect URIs** con `http://localhost:3000/`. Guarda los cambios.

## Instalación

1. Haz copia de seguridad de tu proyecto y de `.env`.
2. Reemplaza los archivos con esta versión.
3. Ejecuta `docker compose up -d --build auth-service frontend`.
4. Inicia sesión con Keycloak, pulsa Cerrar sesión y vuelve a pulsar Continuar con Keycloak. Debe solicitar credenciales.

Nota: Las sesiones OIDC creadas antes de esta actualización no disponen de la nueva cookie de ID token. Para probar el cierre completo, primero vuelve a iniciar sesión con Keycloak después de actualizar.

Limitación: El cierre de sesión no revoca automáticamente todos los JWT de acceso emitidos anteriormente; estos caducan según su expiración. El flujo usa la URL local fija del proyecto y requiere HTTPS/configuración de cookies para despliegues externos.
