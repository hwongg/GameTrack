import { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Search, Library, Sparkles, LogIn, LogOut, Plus, Download, ShieldCheck, Check, LoaderCircle, Eye, EyeOff, Star, Menu, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { api, setAccessToken, getAccessToken } from './services/api';
import GameDetailsModal from './components/GameDetailsModal';

// Estrella vectorial: no depende de que la fuente PDF admita el carácter ★.
function favoriteStarPoints(centerX, centerY, outerRadius, innerRadius) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
  });
}

function drawPdfFavoriteStar(doc, centerX, centerY) {
  const points = favoriteStarPoints(centerX, centerY, 2.9, 1.25);
  const movements = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return [next[0] - point[0], next[1] - point[1]];
  });
  doc.setFillColor(245, 180, 36);
  doc.lines(movements, points[0][0], points[0][1], [1, 1], 'F', true);
}

function drawCanvasFavoriteStar(context, centerX, centerY) {
  const points = favoriteStarPoints(centerX, centerY, 12, 5.3);
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = '#f5b424';
  context.fill();
}

const emptyGameForm = () => ({ title: '', platform: '', genre: '', releaseDate: '', description: '', coverUrl: '', developer: '', publisher: '', screenshots: [] });

const platforms = [
  'PC',
  'PlayStation 5',
  'PlayStation 4',
  'Xbox Series X|S',
  'Xbox One',
  'Nintendo Switch',
  'Android',
  'iOS',
  'Mac',
  'Linux'
];

export default function App() {
  const [games, setGames] = useState([]);
  const [manualGames, setManualGames] = useState([]);
  const [editingGame, setEditingGame] = useState(null);
  const [gameForm, setGameForm] = useState(emptyGameForm());
  const [library, setLibrary] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getAccessToken());
  const [view, setView] = useState('catalog');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [platform, setPlatform] = useState('Todas');
  const [genre, setGenre] = useState('Todos');
  const [sortOrder, setSortOrder] = useState('-rating');
  const [status, setStatus] = useState('Todos');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [notice, setNotice] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [showAuth, setShowAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [globalGames, setGlobalGames] = useState([]);
  const [globalSearch, setGlobalSearch] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [addingGameId, setAddingGameId] = useState(null);
  const [addedGameIds, setAddedGameIds] = useState(new Set());

  // Bloquear la página detrás del modal y conservar su posición de desplazamiento.
  useEffect(() => {
    if (!showAuth) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      Object.assign(body.style, previous);
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollY);
      root.style.scrollBehavior = previousScrollBehavior;
    };
  }, [showAuth]);

  // Ocultar los avisos automáticamente después de cinco segundos.
  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  // Recuperar la sesión usando la cookie HttpOnly de refresh, sin persistir el JWT en el navegador.
  useEffect(() => {
    let cancelled = false;
    const oidcSuccess = new URLSearchParams(window.location.search).get('oidc') === 'success';

    async function restoreSession() {
      try {
        const data = oidcSuccess
          ? await api('/auth/oidc/result')
          : await api('/auth/refresh', { method: 'POST' });
        if (cancelled || !data?.accessToken) return;
        setAccessToken(data.accessToken);
        setToken(data.accessToken);
        const profile = await api('/auth/me');
        if (cancelled) return;
        setUser(profile);
        if (oidcSuccess) setNotice(`Bienvenido, ${profile.name || 'jugador'}.`);
      } catch (error) {
        if (!cancelled && oidcSuccess) setNotice(error.message);
      } finally {
        if (oidcSuccess) {
          const url = new URL(window.location.href);
          url.searchParams.delete('oidc');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (token) {
      loadMe();
      loadLibrary();
    }
  }, [token]);

  async function loadManualGames() {
    try {
      const data = await api('/games?limit=100');
      setManualGames((data.items || []).filter(game =>
        !String(game.externalId || game.external_id || '').startsWith('rawg:')
      ));
    }
    catch (error) { setNotice(error.message); }
  }

  async function saveManualGame(event) {
    event.preventDefault();
    try {
      await api(editingGame ? `/games/${editingGame}` : '/games', {
        method: editingGame ? 'PUT' : 'POST', body: JSON.stringify(gameForm)
      });
      setEditingGame(null);
      setGameForm(emptyGameForm());
      await loadManualGames();
      await searchGlobal(query, platform, sortOrder);
      setNotice('Videojuego guardado correctamente.');
    } catch (error) { setNotice(error.message); }
  }

  async function deleteManualGame(id) {
    if (!window.confirm('¿Eliminar este videojuego del catálogo local?')) return;
    try { await api(`/games/${id}`, { method: 'DELETE' }); await loadManualGames(); await searchGlobal(query, platform, sortOrder); }
    catch (error) { setNotice(error.message); }
  }

  // Unir el catálogo local con RAWG; el registro administrado tiene prioridad.
  function mergeCatalog(localItems, rawgItems, searchText = '', selectedPlatform = 'Todas') {
    const normalize = value => String(value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const search = normalize(searchText);
    const local = localItems.filter(game =>
      !String(game.externalId || '').startsWith('rawg:') &&
      (!search || normalize(game.title).includes(search)) &&
      (selectedPlatform === 'Todas' || normalize(game.platform).includes(normalize(selectedPlatform)))
    );
    const titles = new Set(local.map(game => normalize(game.title)));
    return [...local, ...rawgItems.filter(game => !titles.has(normalize(game.title)))];
  }

  async function fetchUnifiedCatalog(searchText = '', selectedPlatform = 'Todas', selectedSort = sortOrder) {
    const params = new URLSearchParams({ pageSize: '30', ordering: selectedSort });
    if (searchText.trim()) params.set('search', searchText.trim());
    if (selectedPlatform !== 'Todas') params.set('platform', selectedPlatform);

    const [localResult, rawgResult] = await Promise.allSettled([
      api('/games?limit=100'),
      api(`/games/global?${params.toString()}`)
    ]);
    if (localResult.status === 'rejected' && rawgResult.status === 'rejected') {
      throw new Error('No fue posible cargar el catálogo de videojuegos.');
    }
    const local = localResult.status === 'fulfilled' ? (localResult.value.items || []) : [];
    const rawg = rawgResult.status === 'fulfilled' ? (rawgResult.value.items || []) : [];
    return mergeCatalog(local, rawg, searchText, selectedPlatform);
  }

  async function loadGames() {
    try {
      const items = await fetchUnifiedCatalog();
      setGlobalGames(items);
      setGames(items);
      setGlobalSearch(true);
      setActiveSearch('');
    } catch (error) {
      setNotice(error.message || 'No fue posible cargar el catálogo.');
    }
  }

  async function loadMe() {
    try {
      setUser(await api('/auth/me'));
    } catch {
      setUser(null);
    }
  }

  async function loadLibrary() {
    try {
      const data = await api('/library');
      setLibrary(data);
      setAddedGameIds(new Set(data.map(item => item.gameId)));
    } catch {
      setLibrary([]);
      setAddedGameIds(new Set());
    }
  }

  async function loginOrRegister(event) {
    event.preventDefault();
    setLoading(true);
    setNotice('');

    try {
      if (authMode === 'register') {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify(auth)
        });

        setNotice('¡Cuenta creada correctamente! Ahora puede iniciar sesión.');
        setAuthMode('login');
        setAuth(previous => ({ ...previous, password: '' }));
        setShowPassword(false);
      } else {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: auth.email,
            password: auth.password
          })
        });

        setAccessToken(data.accessToken);
        setToken(data.accessToken);
        setUser(data.user);
        setShowAuth(false);
        setNotice(`Bienvenido, ${data.user.name}.`);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}

    setAccessToken(null);
    setToken(null);
    setUser(null);
    setLibrary([]);
    setRecommendations([]);
    setAddedGameIds(new Set());
    setNotice('Sesión cerrada.');
    window.location.assign('/api/auth/oidc/logout');
  }

  function getGameKey(game) {
    return String(
      game?.id ||
      game?.externalId ||
      game?.external_id ||
      game?.title ||
      ''
    );
  }

  function isGameInLibrary(game) {
    if (!game) return false;

    const gameId = String(game.id || '');
    const externalId = String(game.externalId || game.external_id || '');

    return library.some(item => {
      const libraryGameId = String(item.gameId || '');
      const libraryExternalId = String(item.Game?.externalId || '');

      return (
        libraryGameId === gameId ||
        addedGameIds.has(gameId) ||
        (externalId && libraryExternalId === externalId)
      );
    });
  }

  async function addToLibrary(game) {
    if (!token) {
      setShowAuth(true);
      setNotice('Inicie sesión para guardar juegos en su biblioteca.');
      return false;
    }

    const gameKey = getGameKey(game);

    if (isGameInLibrary(game)) {
      setNotice(`${game.title} ya está en su biblioteca.`);
      return false;
    }

    setAddingGameId(gameKey);

    try {
      let gameId = game.id;
      const externalId = String(game.externalId || game.external_id || game.id || '');

      if (String(game.id).startsWith('rawg:') || externalId.startsWith('rawg:')) {
        const imported = await api('/games/import', {
          method: 'POST',
          body: JSON.stringify({
            externalId,
            title: game.title,
            platform: game.platform || 'Plataforma no especificada',
            genre: game.genre || 'Videojuego',
            description: game.description || null,
            coverUrl: game.coverUrl || game.cover_url || null
          })
        });

        gameId = imported.id;
      }

      await api('/library', {
        method: 'POST',
        body: JSON.stringify({
          gameId,
          status: 'pendiente',
          hoursPlayed: 0
        })
      });

      await loadLibrary();

      setAddedGameIds(previous => {
        const next = new Set(previous);
        next.add(String(gameId));
        next.add(String(game.id));
        if (game.externalId || game.external_id) {
          next.add(String(game.externalId || game.external_id));
        }
        return next;
      });

      setNotice(`${game.title} se agregó a su biblioteca.`);
      return true;
    } catch (error) {
      setNotice(error.message);
      return false;
    } finally {
      setAddingGameId(null);
    }
  }

  async function searchGlobal(searchText = query, selectedPlatform = platform, selectedSort = sortOrder) {
    setGlobalLoading(true);
    setNotice('');
    try {
      const items = await fetchUnifiedCatalog(searchText, selectedPlatform, selectedSort);
      setGlobalGames(items);
      setGames(items);
      setGlobalSearch(true);
      setActiveSearch(searchText.trim());
      if (!items.length) setNotice('No se encontraron juegos con esa búsqueda y plataforma.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function loadRecommendations() {
    if (!token) {
      setShowAuth(true);
      setNotice('Inicie sesión para obtener recomendaciones.');
      return;
    }

    try {
      const data = await api('/recommendations');
      setRecommendations(data.recommendations || []);
      setView('recommendations');
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function updateLibraryItem(item, changes) {
    try {
      await api(`/library/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
      });

      await loadLibrary();
    } catch (error) {
      setNotice(error.message);
    }
  }

  const filteredGames = useMemo(() => {
    const results = globalGames.filter(game =>
      genre === 'Todos' || String(game.genre || '').toLowerCase() === genre.toLowerCase()
    );

    if (!activeSearch) return results;

    const normalize = text => String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const searched = normalize(activeSearch);
    const words = searched.split(' ').filter(Boolean);
    if (!words.length) return results;

    const relevance = title => {
      const name = normalize(title);
      if (name === searched) return 0;
      if (name.startsWith(searched + ' ')) return 1;
      if (name.includes(searched)) return 2;
      if (words.every(word => name.split(' ').includes(word))) return 3;
      if (words.every(word => name.includes(word))) return 4;
      return 5;
    };

    // Conservar el orden de RAWG cuando dos juegos tengan igual relevancia.
    return results
      .map((game, index) => ({ game, index, score: relevance(game.title) }))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map(({ game }) => game);
  }, [globalGames, genre, activeSearch]);

  const visibleGames = filteredGames;

  // Descargar las portadas mediante el backend para evitar restricciones CORS.
  async function getImageData(url) {
    if (!url) return null;
    try {
      const response = await fetch(`/api/covers?url=${encodeURIComponent(url)}`, {
        credentials: 'same-origin'
      });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;

      // Convertir a JPEG para que jsPDF y canvas admitan todos los formatos de origen.
      return await new Promise(resolve => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            if (!canvas.width || !canvas.height || canvas.width * canvas.height > 20000000) {
              resolve(null);
              return;
            }
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } catch { resolve(null); }
          finally { URL.revokeObjectURL(objectUrl); }
        };
        image.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
        image.src = objectUrl;
      });
    } catch {
      return null;
    }
  }

  async function exportPDF() {
    let missingCovers = 0;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('GameTrack - Mi biblioteca', 14, 20);

    doc.setFontSize(10);
    doc.text(
      `Usuario: ${user?.name || 'Invitado'} | Fecha: ${new Date().toLocaleDateString('es-GT')}`,
      14,
      28
    );

    let y = 38;

    for (const [index, item] of library.entries()) {
      const game = item.Game || {};

      if (y > 250) {
        doc.addPage();
        y = 20;
      }

      const cover = await getImageData(game.coverUrl);

      if (cover) {
        try {
          doc.addImage(cover, 'JPEG', 14, y, 22, 31, undefined, 'FAST');
        } catch {
          doc.setDrawColor(120);
          doc.rect(14, y, 22, 31);
        }
      } else {
        if (game.coverUrl) missingCovers++;
        doc.setDrawColor(120);
        doc.rect(14, y, 22, 31);
        doc.setFontSize(7);
        doc.text('Sin portada', 16, y + 16);
      }

      // Señalar los favoritos en la exportación completa de la biblioteca.
      if (item.favorite === true) {
        drawPdfFavoriteStar(doc, 45, y + 4);
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(
        `${index + 1}. ${game.title || 'Juego'}`,
        item.favorite === true ? 52 : 42,
        y + 5,
        { maxWidth: item.favorite === true ? 140 : 150 }
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const platformsText = String(game.platform || '')
        .split(',')
        .map(value => value.trim())
        .join(', ');

      doc.text(
        doc.splitTextToSize(`Plataformas: ${platformsText}`, 150),
        42,
        y + 12
      );

      doc.text(
        `Género: ${game.genre || 'Sin género'} | Estado: ${item.status} | Horas: ${item.hoursPlayed}`,
        42,
        y + 23,
        { maxWidth: 150 }
      );

      y += 38;
    }

    doc.save('gametrack-biblioteca.pdf');
    if (missingCovers) setNotice(`PDF generado, pero no se pudieron descargar ${missingCovers} portada(s). Revise las URL directas HTTPS de las imágenes.`);
  }

  async function exportJPG() {
    let missingCovers = 0;
    const rowHeight = 150;
    const canvas = document.createElement('canvas');

    canvas.width = 1200;
    canvas.height = Math.max(320, 130 + library.length * rowHeight);

    const context = canvas.getContext('2d');

    context.fillStyle = '#09090f';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#c4b5fd';
    context.font = 'bold 38px Arial';
    context.fillText('GameTrack | Mi biblioteca', 40, 55);

    context.fillStyle = '#a1a1aa';
    context.font = '18px Arial';
    context.fillText(
      `Usuario: ${user?.name || 'Invitado'} • ${new Date().toLocaleDateString('es-GT')}`,
      42,
      88
    );

    for (const [index, item] of library.entries()) {
      const game = item.Game || {};
      const y = 110 + index * rowHeight;

      context.fillStyle = '#171725';
      context.fillRect(35, y, 1130, 135);

      const coverData = await getImageData(game.coverUrl);

      if (coverData) {
        try {
          await new Promise((resolve, reject) => {
            const image = new Image();

            image.onload = () => {
              context.drawImage(image, 48, y + 8, 78, 118);
              resolve();
            };

            image.onerror = reject;
            image.src = coverData;
          });
        } catch {
          missingCovers++;
          context.fillStyle = '#30294a';
          context.fillRect(48, y + 8, 78, 118);
        }
      } else {
        if (game.coverUrl) missingCovers++;
        context.fillStyle = '#30294a';
        context.fillRect(48, y + 8, 78, 118);
      }

      if (item.favorite === true) {
        drawCanvasFavoriteStar(context, 155, y + 26);
      }

      context.fillStyle = '#f4f4f5';
      context.font = 'bold 25px Arial';
      context.fillText(
        (game.title || 'Juego').slice(0, 65),
        item.favorite === true ? 178 : 145,
        y + 34,
        item.favorite === true ? 950 : 980
      );

      context.fillStyle = '#c4b5fd';
      context.font = '17px Arial';

      const platformText = String(
        game.platform || 'Plataforma desconocida'
      );

      context.fillText(
        `Plataformas: ${platformText.slice(0, 105)}`,
        145,
        y + 65
      );

      context.fillStyle = '#a1a1aa';
      context.font = '17px Arial';

      context.fillText(
        `Estado: ${item.status} • ${item.hoursPlayed} horas • ${game.genre || 'Sin género'}`,
        145,
        y + 95
      );
    }

    const link = document.createElement('a');
    link.download = 'gametrack-biblioteca.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
    if (missingCovers) setNotice(`JPG generado, pero no se pudieron descargar ${missingCovers} portada(s). Revise las URL directas HTTPS de las imágenes.`);
  }

  const getPlaceholder = title =>
    `https://placehold.co/500x700/171725/c4b5fd?text=${encodeURIComponent(title || 'Juego')}`;

  return (
    <div className="min-h-screen bg-night text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-night/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <button
            className="flex items-center gap-3"
            onClick={() => { setView('catalog'); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            <span className="rounded-xl bg-violet-500 p-2">
              <Gamepad2 size={25} />
            </span>

            <span className="text-left">
              <span className="block text-xl font-black tracking-tight">
                GameTrack<span className="text-violet-400">.</span>
              </span>

              <span className="hidden text-xs text-zinc-500 sm:block">
                Tu universo gamer, organizado
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-2 md:flex">
            {user?.role === 'admin' && <button className={`nav-button ${view === 'admin' ? 'nav-active' : ''}`} onClick={() => { setView('admin'); loadManualGames(); }}>Administrar juegos</button>}
            <button
              className={`nav-button ${view === 'catalog' ? 'nav-active' : ''}`}
              onClick={() => setView('catalog')}
            >
              Explorar
            </button>

            <button
              className={`nav-button ${view === 'library' ? 'nav-active' : ''}`}
              onClick={() => {
                setView('library');

                if (!token) {
                  setShowAuth(true);
                }
              }}
            >
              Mi biblioteca
            </button>

            <button
              className={`nav-button ${view === 'recommendations' ? 'nav-active' : ''}`}
              onClick={loadRecommendations}
            >
              <Sparkles size={16} />
              Para ti
            </button>
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden max-w-28 truncate text-sm text-zinc-300 sm:block">
                  {user.name}
                </span>

                <button
                  className="icon-button"
                  title="Cerrar sesión"
                  onClick={logout}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button
                className="primary-button"
                onClick={() => setShowAuth(true)}
              >
                <LogIn size={16} />
                Entrar
              </button>
            )}
            <button
              type="button"
              className="icon-button md:hidden"
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileMenuOpen}
              aria-controls="gametrack-mobile-navigation"
              onClick={() => setMobileMenuOpen(open => !open)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <nav id="gametrack-mobile-navigation" aria-label="Navegación móvil" className="border-t border-white/10 px-5 pb-4 pt-3 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              <button className={`nav-button w-full ${view === 'catalog' ? 'nav-active' : ''}`} onClick={() => { setView('catalog'); setMobileMenuOpen(false); }}>Explorar</button>
              <button className={`nav-button w-full ${view === 'library' ? 'nav-active' : ''}`} onClick={() => { setView('library'); if (!token) setShowAuth(true); setMobileMenuOpen(false); }}>Mi biblioteca</button>
              <button className={`nav-button w-full ${view === 'recommendations' ? 'nav-active' : ''}`} onClick={() => { loadRecommendations(); setMobileMenuOpen(false); }}><Sparkles size={16} />Para ti</button>
              {user?.role === 'admin' && <button className={`nav-button w-full ${view === 'admin' ? 'nav-active' : ''}`} onClick={() => { setView('admin'); loadManualGames(); setMobileMenuOpen(false); }}>Administrar juegos</button>}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-16 pt-8">
        {notice && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between rounded-xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100"
          >
            <span>{notice}</span>

            <button
              onClick={() => setNotice('')}
              aria-label="Cerrar aviso"
            >
              ×
            </button>
          </div>
        )}

        {view === 'admin' && user?.role === 'admin' && (
          <section className="rounded-2xl border border-white/10 p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Administrar catálogo local</h2>
            <form onSubmit={saveManualGame} className="grid gap-3 max-w-xl">
              {['coverUrl', 'title', 'genre', 'platform', 'description', 'developer', 'publisher'].map(field => (
                <label key={field} className="grid gap-1 text-sm">
                  {({title:'Título',platform:'Plataforma',genre:'Género',description:'Descripción',developer:'Desarrollador',publisher:'Distribuidor',coverUrl:'URL de portada'})[field]}
                  <input className="rounded-lg bg-zinc-800 p-3 text-white" value={gameForm[field]} required={['title','platform','genre'].includes(field)} onChange={e => setGameForm(previous => ({...previous,[field]:e.target.value}))} />
                </label>
              ))}
              <label className="grid gap-1 text-sm">
                Fecha de lanzamiento
                <input
                  type="date"
                  className="rounded-lg bg-zinc-800 p-3 text-white"
                  value={gameForm.releaseDate}
                  onChange={event => setGameForm(previous => ({ ...previous, releaseDate: event.target.value }))}
                />
              </label>
              <div className="grid gap-2 text-sm">
                <span>Capturas del juego (hasta 8 imágenes JPG, PNG o WebP; máximo 1 MB cada una)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="rounded-lg bg-zinc-800 p-3 text-white" onChange={async event => {
                  const files = Array.from(event.target.files || []);
                  if (files.length + gameForm.screenshots.length > 8) { setNotice('Máximo 8 capturas por juego.'); event.target.value = ''; return; }
                  if (files.some(file => file.size > 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) { setNotice('Cada captura debe ser JPG, PNG o WebP de hasta 1 MB.'); event.target.value = ''; return; }
                  try {
                    const images = await Promise.all(files.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); })));
                    setGameForm(previous => ({ ...previous, screenshots: [...previous.screenshots, ...images].slice(0,8) }));
                  } catch { setNotice('No fue posible leer las capturas.'); }
                  event.target.value = '';
                }} />
                {gameForm.screenshots.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {gameForm.screenshots.map((src, index) => <div key={index} className="relative">
                    <img src={src} alt={`Captura ${index + 1}`} className="aspect-video w-full rounded-lg object-cover" />
                    <button type="button" className="absolute right-1 top-1 rounded bg-red-700 px-2 py-1 text-xs text-white" onClick={() => setGameForm(previous => ({ ...previous, screenshots: previous.screenshots.filter((_, i) => i !== index) }))}>Quitar</button>
                  </div>)}
                </div>}
              </div>
              <div className="flex gap-2">
                <button className="primary-button" type="submit">{editingGame ? 'Guardar cambios' : 'Agregar juego'}</button>
                {editingGame && <button type="button" className="nav-button" onClick={() => {setEditingGame(null);setGameForm(emptyGameForm());}}>Cancelar</button>}
              </div>
            </form>
            <div className="mt-6 grid gap-2">
              {manualGames.map(game => <div key={game.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-800 p-3">
                <span>{game.title} · {game.platform}{game.releaseDate ? ` · Lanzamiento: ${game.releaseDate}` : ' · Lanzamiento pendiente'}</span>
                <div className="flex gap-2">
                  <button className="nav-button" onClick={() => {setEditingGame(game.id);setGameForm({title:game.title,platform:game.platform,genre:game.genre,releaseDate:game.releaseDate||'',description:game.description||'',coverUrl:game.coverUrl||'',developer:game.developer||'',publisher:game.publisher||'',screenshots:game.screenshots||[]});}}>Editar</button>
                  <button className="nav-button" onClick={() => deleteManualGame(game.id)}>Eliminar</button>
                </div>
              </div>)}
            </div>
          </section>
        )}

        {view === 'catalog' && (
          <>
            <section className="hero-panel mb-9 overflow-hidden rounded-3xl p-7 sm:p-10">
              <div className="relative z-10 max-w-2xl">
                <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
                  <Sparkles size={14} />
                  TU PRÓXIMA AVENTURA EMPIEZA AQUÍ
                </span>

                <h1 className="mb-4 text-4xl font-black leading-tight sm:text-6xl">
                  Todos tus juegos.
                  <br />
                  <span className="gradient-text">
                    Una sola biblioteca.
                  </span>
                </h1>

                <p className="mb-6 max-w-xl text-sm leading-6 text-zinc-300 sm:text-base">
                  Descubre nuevos mundos, organiza lo que juegas y encuentra tu próxima obsesión gamer.
                </p>

                <button
                  onClick={() =>
                    document
                      .getElementById('catalog')
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="primary-button"
                >
                  Explorar catálogo
                  <Gamepad2 size={17} />
                </button>
              </div>

              <div className="hero-orb" />
            </section>

            <section id="catalog">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-[.2em] text-violet-300">
                    DESCUBRE
                  </p>

                  <h2 className="text-2xl font-bold sm:text-3xl">
                    Explora videojuegos
                  </h2>
                </div>

                <span className="text-sm text-zinc-500">
                  {`${visibleGames.length} videojuegos encontrados`}
                </span>
              </div>

              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_210px_180px]">
                <div className="search-box">
                  <Search size={18} className="text-zinc-500" />

                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        searchGlobal();
                      }
                    }}
                    placeholder="Buscar cualquier videojuego..."
                    aria-label="Buscar videojuegos"
                  />
                </div>

                <select
                  className="filter-select"
                  value={platform}
                  onChange={event => {
                    setPlatform(event.target.value);

                    searchGlobal(query, event.target.value);
                  }}
                  aria-label="Seleccionar plataforma"
                >
                  <option>Todas</option>

                  {platforms.map(value => (
                    <option key={value}>{value}</option>
                  ))}
                </select>

                <select
                  className="filter-select"
                  value={genre}
                  onChange={event => setGenre(event.target.value)}
                  aria-label="Filtrar género"
                >
                  <option>Todos</option>

                  {[...new Set(games.map(game => game.genre))].map(value => (
                    <option key={value}>{value}</option>
                  ))}
                </select>

                <select
                  className="filter-select"
                  value={sortOrder}
                  onChange={event => {
                    setSortOrder(event.target.value);
                    searchGlobal(query, platform, event.target.value);
                  }}
                  aria-label="Ordenar catálogo"
                >
                  <option value="-rating">Más populares</option>
                  <option value="name">Nombre A-Z</option>
                  <option value="-released">Lanzamiento reciente</option>
                  <option value="released">Lanzamiento antiguo</option>
                  <option value="-metacritic">Metacritic</option>
                </select>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  className="primary-button"
                  onClick={searchGlobal}
                  disabled={globalLoading}
                >
                  {globalLoading ? (
                    <>
                      <LoaderCircle size={16} className="animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      Buscar videojuegos
                      <Search size={16} />
                    </>
                  )}
                </button>

  

                <span className="self-center text-xs text-zinc-500">
                  {'Catálogo unificado · GameTrack + RAWG'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {visibleGames.map(game => {
                  const gameKey = getGameKey(game);
                  const inLibrary = isGameInLibrary(game);
                  const isAdding = addingGameId === gameKey;

                  return (
                    <article
                      key={game.id}
                      className="game-card game-card-animated group"
                    >
                      <div className="cover-wrap">
                        <img
                          src={
                            game.coverUrl ||
                            game.cover_url ||
                            getPlaceholder(game.title)
                          }
                          alt={`Portada de ${game.title}`}
                          title={`Ver información de ${game.title}`}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer"
                          onClick={() => setSelectedGame(game)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              setSelectedGame(game);
                            }
                          }}
                          loading="lazy"
                          onError={event => {
                            event.currentTarget.src = getPlaceholder(game.title);
                          }}
                        />

                        <span className="cover-platform">
                          {String(game.platform || '')
                            .split(',')[0]
                            .trim()}
                        </span>

                        <button
                          className={`add-game ${isAdding ? 'add-game-loading' : ''} ${inLibrary ? 'add-game-added' : ''}`}
                          onClick={() => addToLibrary(game)}
                          disabled={inLibrary || isAdding}
                          aria-label={`Agregar ${game.title} a mi biblioteca`}
                        >
                          {isAdding ? (
                            <LoaderCircle size={19} className="animate-spin" />
                          ) : inLibrary ? (
                            <Check size={19} />
                          ) : (
                            <Plus size={20} />
                          )}
                        </button>
                      </div>

                      <div className="pt-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                          {game.genre}
                        </p>

                        <h3
                          className="line-clamp-2 min-h-10 cursor-pointer text-sm font-bold leading-5 hover:text-violet-300"
                          onClick={() => setSelectedGame(game)}
                        >
                          {game.title}
                        </h3>

                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {'Agrega este juego a tu biblioteca.'}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              {!visibleGames.length && (
                <div className="rounded-2xl border border-white/10 p-10 text-center text-zinc-400">
                  No se encontraron juegos con esos filtros.
                </div>
              )}
            </section>
          </>
        )}

        {view === 'library' && (
          <section>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[.2em] text-violet-300">
                  TU COLECCIÓN
                </p>

                <h1 className="text-3xl font-black">
                  Mi biblioteca
                </h1>

                <p className="mt-2 text-sm text-zinc-400">
                  Lleva el seguimiento de tus partidas y tus próximos juegos.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="secondary-button"
                  onClick={exportPDF}
                >
                  <Download size={16} />
                  Exportar PDF
                </button>

                <button
                  className="secondary-button"
                  onClick={exportJPG}
                >
                  Exportar JPG
                </button>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              <button
                className={`filter-chip ${status === 'Todos' && !favoritesOnly ? 'filter-chip-active' : ''}`}
                onClick={() => { setStatus('Todos'); setFavoritesOnly(false); }}
              >
                Todos
              </button>

              {['pendiente', 'jugando', 'completado', 'abandonado'].map(value => (
                <button
                  key={value}
                  className={`filter-chip ${status === value ? 'filter-chip-active' : ''}`}
                  onClick={() => { setStatus(value); setFavoritesOnly(false); }}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
              <button
                className={`filter-chip ${favoritesOnly ? 'filter-chip-active' : ''}`}
                onClick={() => { setStatus('Todos'); setFavoritesOnly(value => !value); }}
              >
                <Star size={14} /> Favoritos
              </button>
            </div>


            {!token ? (
              <div className="empty-panel">
                <Library size={35} />

                <h3>
                  Tu colección te espera
                </h3>

                <p>
                  Inicia sesión para guardar juegos y registrar tus horas.
                </p>

                <button
                  className="primary-button"
                  onClick={() => setShowAuth(true)}
                >
                  Iniciar sesión
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {library
                  .filter(item => favoritesOnly || status === 'Todos' || item.status === status)
                  .filter(item => !favoritesOnly || item.favorite)
                  .sort((a, b) => String(a.Game?.title || '').localeCompare(String(b.Game?.title || ''), 'es'))
                  .map(item => (
                    <div
                      key={item.id}
                      className="library-row"
                    >
                      <button
                        type="button"
                        className="block h-28 w-20 flex-none cursor-pointer overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
                        onClick={() => item.Game && setSelectedGame({ ...item.Game, fromLibrary: true })}
                        aria-label={`Ver detalles de ${item.Game?.title || 'este juego'}`}
                        title="Ver detalles del juego"
                      >
                        <img
                          src={item.Game?.coverUrl || getPlaceholder(item.Game?.title || 'Juego')}
                          alt={`Portada de ${item.Game?.title || 'videojuego'}`}
                          className="block h-full w-full object-cover"
                          loading="lazy"
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="block max-w-full cursor-pointer text-left hover:text-violet-300 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
                          onClick={() => item.Game && setSelectedGame({ ...item.Game, fromLibrary: true })}
                          aria-label={`Ver detalles de ${item.Game?.title || 'este juego'}`}
                          title="Ver detalles del juego"
                        >
                          <h3 className="font-bold">{item.Game?.title}</h3>
                        </button>

                        <p className="mt-1 text-xs text-zinc-400">
                          {item.Game?.platform} · {item.Game?.genre}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {item.hoursPlayed} horas registradas
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          className={`icon-button ${item.favorite ? 'text-yellow-400' : 'text-zinc-500'}`}
                          onClick={() => updateLibraryItem(item, { favorite: !item.favorite })}
                          aria-label={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                          title={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                        >
                          <Star size={18} fill={item.favorite ? 'currentColor' : 'none'} />
                        </button>
                        <select
                          className="filter-select text-xs"
                          value={item.status}
                          onChange={event =>
                            updateLibraryItem(item, {
                              status: event.target.value
                            })
                          }
                        >
                          {['pendiente', 'jugando', 'completado', 'abandonado'].map(value => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>

                        <input
                          className="hours-input"
                          type="number"
                          min="0"
                          max="100000"
                          step="0.5"
                          value={item.hoursPlayed}
                          aria-label="Horas jugadas"
                          onChange={event =>
                            updateLibraryItem(item, {
                              hoursPlayed: Number(event.target.value)
                            })
                          }
                        />
                      </div>

                      <button
                        className="icon-button"
                        onClick={async () => {
                          try {
                            await api(`/library/${item.id}`, {
                              method: 'DELETE'
                            });

                            await loadLibrary();
                          } catch (error) {
                            setNotice(error.message);
                          }
                        }}
                        aria-label="Eliminar de biblioteca"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                {library.length === 0 && (
                  <div className="empty-panel">
                    <Library size={35} />

                    <h3>
                      Tu biblioteca está vacía
                    </h3>

                    <p>
                      Agrega videojuegos desde Explorar para verlos aquí.
                    </p>

                    <button
                      className="primary-button"
                      onClick={() => setView('catalog')}
                    >
                      Explorar juegos
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {view === 'recommendations' && (
          <section>
            <div className="mb-7">
              <p className="mb-1 text-xs font-bold uppercase tracking-[.2em] text-violet-300">
                SELECCIÓN PERSONAL
              </p>

              <h1 className="text-3xl font-black">
                Recomendaciones para ti
              </h1>

              <p className="mt-2 text-sm text-zinc-400">
                Sugerencias calculadas a partir de tu biblioteca e historial disponible.
              </p>
            </div>

            {recommendations.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.map(item => {
                  const recommendationGame = {
                    id: item.game_id,
                    externalId: item.external_id,
                    title: item.title,
                    genre: item.genre,
                    platform: item.platform,
                    description: item.description,
                    coverUrl: item.cover_url
                  };

                  const gameKey = getGameKey(recommendationGame);
                  const inLibrary = isGameInLibrary(recommendationGame);
                  const isAdding = addingGameId === gameKey;

                  return (
                    <div
                      key={item.game_id}
                      className="recommendation-card overflow-hidden rounded-2xl border border-white/10 bg-panel"
                    >
                      <button
                        className="recommendation-cover"
                        onClick={() => setSelectedGame(recommendationGame)}
                        aria-label={`Ver información de ${item.title}`}
                      >
                        <img
                          src={
                            item.cover_url ||
                            getPlaceholder(item.title)
                          }
                          alt={`Portada de ${item.title}`}
                          onError={event => {
                            event.currentTarget.src = getPlaceholder(item.title);
                          }}
                        />

                        <span className="recommendation-cover-label">
                          Ver detalles
                        </span>
                      </button>

                      <div className="p-5">
                        <Sparkles className="mb-3 text-violet-300" />

                        <h3 className="font-bold">
                          {item.title}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-400">
                          {item.genre} · {item.platform}
                        </p>

                        <p className="mt-3 text-xs leading-5 text-zinc-500">
                          {item.reason}
                        </p>

                        <button
                          className={`primary-button mt-4 w-full justify-center ${isAdding ? 'button-loading' : ''}`}
                          onClick={() => addToLibrary(recommendationGame)}
                          disabled={inLibrary || isAdding}
                        >
                          {isAdding ? (
                            <>
                              <LoaderCircle
                                size={16}
                                className="animate-spin"
                              />
                              Agregando...
                            </>
                          ) : inLibrary ? (
                            <>
                              <Check size={16} />
                              Ya está en mi biblioteca
                            </>
                          ) : (
                            <>
                              <Plus size={16} />
                              Agregar a mi biblioteca
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-panel">
                <Sparkles size={35} />

                <h3>
                  Descubre qué jugar después
                </h3>

                <p>
                  Agrega juegos a tu biblioteca para generar recomendaciones.
                </p>

                <button
                  className="primary-button"
                  onClick={() => setView('catalog')}
                >
                  Explorar catálogo
                </button>
              </div>
            )}
          </section>
        )}

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-zinc-600">
          <span>
            © 2026 GameTrack · Tu aventura, a tu manera. · Datos del catálogo global:{' '}
            <a
              className="text-violet-400 hover:text-violet-300"
              href="https://rawg.io"
              target="_blank"
              rel="noreferrer"
            >
              RAWG
            </a>
          </span>

          <span className="flex items-center gap-2">
            <ShieldCheck size={14} />
            Sesiones protegidas · API modular
          </span>
        </footer>
      </main>

      {selectedGame && (
        <GameDetailsModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onAdd={async game => {
            const added = await addToLibrary(game);

            if (added) {
              setSelectedGame(null);
            }
          }}
        />
      )}

      {showAuth && (
        <div
          className="modal-backdrop !overflow-hidden overscroll-contain"
          onClick={() => setShowAuth(false)}
        >
          <div
            className="modal-panel relative max-h-[calc(100dvh-40px)] overflow-y-auto overscroll-contain border border-violet-400/20 shadow-2xl shadow-violet-950/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="modal-close z-10"
              onClick={() => setShowAuth(false)}
              aria-label="Cerrar"
            >
              ×
            </button>

            <div className="mb-5 flex justify-center">
              <span className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-3 shadow-lg shadow-violet-500/30 transition-transform duration-300 hover:scale-110">
                <Gamepad2 size={28} />
              </span>
            </div>

            <h2
              id="auth-title"
              className="text-center text-2xl font-black"
            >
              {authMode === 'login'
                ? 'Qué bueno verte'
                : 'Únete a GameTrack'}
            </h2>

            <p className="mb-6 mt-2 text-center text-sm text-zinc-400">
              {authMode === 'login'
                ? 'Entra para continuar tu aventura.'
                : 'Crea tu cuenta y organiza tu colección.'}
            </p>

            <a href="/api/auth/oidc/login" className="mb-4 block rounded-xl bg-violet-600 px-4 py-3 text-center font-bold text-white hover:bg-violet-500">Continuar con Keycloak (OpenID Connect)</a>
            <form
              onSubmit={loginOrRegister}
              className="space-y-4"
            >
              {authMode === 'register' && (
                <input
                  className="form-input"
                  required
                  minLength="2"
                  maxLength="80"
                  autoComplete="name"
                  placeholder="Nombre"
                  value={auth.name}
                  onChange={event =>
                    setAuth({
                      ...auth,
                      name: event.target.value
                    })
                  }
                />
              )}

              <input
                className="form-input"
                type="email"
                required
                maxLength="254"
                autoComplete="email"
                placeholder="Correo electrónico"
                value={auth.email}
                onChange={event =>
                  setAuth({
                    ...auth,
                    email: event.target.value
                  })
                }
              />

              <div className="relative">
              <input
                className="form-input pr-12 transition-all duration-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={authMode === 'register' ? 10 : 1}
                maxLength="72"
                autoComplete={
                  authMode === 'login'
                    ? 'current-password'
                    : 'new-password'
                }
                placeholder={
                  authMode === 'register'
                    ? 'Contraseña (mínimo 10 caracteres)'
                    : 'Contraseña'
                }
                value={auth.password}
                onChange={event =>
                  setAuth({
                    ...auth,
                    password: event.target.value
                  })
                }
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-violet-300"
                onClick={() => setShowPassword(previous => !previous)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              </div>

              {authMode === 'register' && (
                <div className="rounded-lg border border-violet-400/15 bg-violet-500/5 px-3 py-2 text-xs text-zinc-400">
                  <div className="mb-2 flex items-center justify-between">
                    <span>Seguridad de la contraseña</span>
                    <span className={auth.password.length >= 10 ? 'text-emerald-400' : 'text-zinc-500'}>
                      {auth.password.length >= 10 ? 'Correcta' : `${auth.password.length}/10`}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full transition-all duration-300 ${auth.password.length >= 10 ? 'w-full bg-emerald-400' : auth.password.length >= 6 ? 'w-2/3 bg-amber-400' : auth.password.length > 0 ? 'w-1/3 bg-violet-400' : 'w-0'}`} />
                  </div>
                </div>
              )}

              <button
                className="primary-button w-full justify-center transition-all duration-200 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading
                  ? <><LoaderCircle size={17} className="animate-spin" /> Procesando...</>
                  : authMode === 'login'
                    ? 'Iniciar sesión'
                    : 'Crear cuenta'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-zinc-400">
              {authMode === 'login'
                ? '¿No tienes cuenta?'
                : '¿Ya tienes cuenta?'}{' '}

              <button
                className="font-semibold text-violet-300 hover:text-violet-200"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setNotice('');
                  setAuth(previous => ({ ...previous, password: '' }));
                  setShowPassword(false);
                }}
              >
                {authMode === 'login'
                  ? 'Regístrate'
                  : 'Inicia sesión'}
              </button>
            </p>

            <p className="mt-4 text-center text-xs text-zinc-600">
              El registro público siempre crea usuarios normales.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
