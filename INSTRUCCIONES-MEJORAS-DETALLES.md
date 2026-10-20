# GameTrack: descripciones en español y galería

## Instalación

1. Haz una copia de seguridad de `C:\GameTrack`.
2. Copia las rutas de este ZIP a `C:\GameTrack`, respetando las carpetas. **No reemplaces `frontend/src/App.jsx`**: conserva el menú móvil que ya instalaste.
3. En PowerShell, desde `C:\GameTrack`:

```powershell
docker compose up -d --build backend backend2 frontend translate
docker compose restart proxy
docker compose ps
```

4. Espera a que LibreTranslate descargue/inicialice sus modelos. La primera ejecución puede tardar varios minutos y consumir memoria y espacio en disco. Para comprobar:

```powershell
docker compose logs --tail=40 translate
curl.exe -i http://localhost:3000/api/games/global/326243
```

5. Recarga el navegador con `Ctrl+F5` y abre detalles de un juego de RAWG, biblioteca y recomendaciones.

## Cambios
- Backend consulta desarrolladores, distribuidores y hasta 12 capturas desde la API RAWG.
- Traducción al español con servicio LibreTranslate local; caché temporal en cada réplica.
- Los juegos sin ID de RAWG se buscan por título exacto; si no se encuentra coincidencia, no se inventan metadatos.
- La ventana de detalles es común a catálogo, biblioteca y recomendaciones.

## Limitaciones
- RAWG no siempre proporciona desarrollador, distribuidor ni capturas.
- Si la traducción falla o el modelo del idioma no está disponible, se muestra un aviso en español, no una traducción inventada.
- Las descripciones extensas se limitan a 9.600 caracteres para reducir carga; no es traducción garantizada de todos los idiomas.
- Las descripciones guardadas en PostgreSQL no se reescriben; se traducen al abrir detalles.
- LibreTranslate agrega un contenedor y puede requerir varios minutos de arranque; si Docker no dispone de recursos suficientes, el traductor podría fallar.
- La coincidencia de título exacto puede no identificar ediciones alternativas de juegos.
