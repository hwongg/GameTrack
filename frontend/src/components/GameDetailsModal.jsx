import { useEffect, useState } from 'react';
import { Image as ImageIcon, Plus, X, LoaderCircle } from 'lucide-react';
import { api } from '../services/api';

const summaries = {
  'Cyberpunk 2077': 'En Night City, una megalópolis obsesionada con el poder y las modificaciones corporales, juegas como V, un mercenario que busca un implante único capaz de otorgar la inmortalidad.',
  'Stardew Valley': 'Hereda la vieja granja de tu abuelo y deja atrás la vida de oficina. Cultiva, cría animales, pesca, explora cuevas y conoce a los habitantes del valle.',
  'Elden Ring': 'Viaja por las Tierras Intermedias, explora un vasto mundo de fantasía y combate enemigos formidables para descubrir los secretos del Círculo de Elden.',
  'God of War Ragnarök': 'Kratos y Atreus emprenden un viaje por los Nueve Reinos mientras se aproxima el Ragnarök. Explora mundos nórdicos y enfréntate a dioses y monstruos.',
  'Minecraft': 'Un mundo abierto de bloques donde puedes explorar, construir, fabricar herramientas y sobrevivir en modo creativo o supervivencia.',
  'The Legend of Zelda: Tears of the Kingdom': 'Acompaña a Link en una aventura por Hyrule y las islas del cielo, usando nuevas habilidades para explorar, construir y resolver desafíos.'
};

export default function GameDetailsModal({ game, onClose, onAdd }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Bloquear el scroll de la pagina mientras los detalles esten abiertos.
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, []);


  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setTranslating(false);
      setDetails(null);

      const result = {
        synopsis:
          summaries[game.title] ||
          'Cargando descripción en español...',
        screenshots: []
      };

      const externalId = String(game.externalId || game.external_id || game.id || '');
      try {
        // El mismo endpoint en catálogo, biblioteca y sugerencias de IA.
        const path = externalId.startsWith('rawg:')
          ? `/games/global/${encodeURIComponent(externalId.slice(5))}`
          : `/games/details-by-title?title=${encodeURIComponent(game.title)}`;
        const response = await api(path);
        const data = response.item;
        if (data) {
          // Nunca sustituir el texto español por la descripción original en otro idioma.
          result.synopsis = summaries[game.title] || 'Preparando descripción en español...';
          result.description = result.synopsis;
          result.developer = data.developer || null;
          result.publisher = data.publisher || null;
          result.releaseDate = data.releaseDate || null;
          result.screenshots = (data.screenshots || []).filter(Boolean).slice(0, 12);
          result.rawgId = data.rawgId;
        } else {
          result.synopsis = summaries[game.title] || 'Descripción en español no disponible para este juego.';
          result.description = result.synopsis;
        }
      } catch {
        result.synopsis = summaries[game.title] || 'No fue posible cargar la descripción en español.';
        result.description = result.synopsis;
      }

      if (!result.screenshots.length && (game.coverUrl || game.cover_url)) {
        result.screenshots = [game.coverUrl || game.cover_url];
      }

      if (!cancelled) {
        setDetails(result);
        setLoading(false);
        if (result.rawgId) {
          setTranslating(true);
          api(`/games/global/${encodeURIComponent(result.rawgId)}/translation`)
            .then(response => {
              if (!cancelled && response.descriptionEs) setDetails(previous => ({ ...previous, synopsis: response.descriptionEs, description: response.descriptionEs }));
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setTranslating(false); });
        }
      }
    }

    loadDetails();

    return () => {
      cancelled = true;
    };
  }, [game]);

  async function handleAdd() {
    if (adding) return;

    setAdding(true);

    try {
      await onAdd(game);
    } finally {
      setAdding(false);
    }
  }

  const cover =
    game.coverUrl ||
    game.cover_url ||
    `https://placehold.co/500x700/171725/c4b5fd?text=${encodeURIComponent(game.title)}`;

  return (
    <div
      className="modal-backdrop game-details-backdrop"
      style={{ overscrollBehavior: 'contain' }}
      onClick={onClose}
    >
      <div
        className="game-details-modal"
        style={{ overscrollBehavior: 'contain' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-detail-title"
        onClick={event => event.stopPropagation()}
      >
        <button
          className="modal-close z-20"
          onClick={onClose}
          aria-label="Cerrar detalles"
        >
          <X size={22} />
        </button>

        <div className="game-details-header">
          <div className="game-details-cover-box">
            <img
              src={cover}
              alt={`Portada de ${game.title}`}
              className="game-details-cover"
              fetchPriority="high"
              decoding="async"
              onError={event => {
                event.currentTarget.src =
                  `https://placehold.co/500x700/171725/c4b5fd?text=${encodeURIComponent(game.title)}`;
              }}
            />
          </div>

          <div className="game-details-heading">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-violet-300">
              DETALLES DEL JUEGO
            </p>

            <h2
              id="game-detail-title"
              className="mb-3 pr-8 text-3xl font-black sm:text-4xl"
            >
              {game.title}
            </h2>

            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-violet-400/15 px-3 py-1 text-xs text-violet-200">
                {game.genre || 'Videojuego'}
              </span>

              {String(game.platform || '')
                .split(',')
                .map(value => value.trim())
                .filter(Boolean)
                .map(value => (
                  <span
                    key={value}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300"
                  >
                    {value}
                  </span>
                ))}
            </div>

          </div>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <section>
            <h3 className="mb-2 text-xl font-bold">
              Acerca de este juego
            </h3>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
                Buscando descripción y datos del juego...
              </div>
            ) : (
              <p className="whitespace-pre-line text-sm leading-7 text-zinc-300">
                {details?.description ||
                  details?.synopsis ||
                  'No hay descripción adicional disponible en español.'}
              </p>
            )}
            {translating && <p className="mt-2 text-xs text-violet-300">Preparando traducción en español...</p>}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Desarrollador
                </p>

                <p className="mt-1 font-semibold">
                  {details?.developer ||
                    'Información no disponible'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Distribuidor
                </p>

                <p className="mt-1 font-semibold">
                  {details?.publisher ||
                    'Información no disponible'}
                </p>
              </div>

              {details?.releaseDate && (
                <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Lanzamiento
                  </p>

                  <p className="mt-1 font-semibold">
                    {details.releaseDate}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon
                size={20}
                className="text-violet-300"
              />

              <h3 className="text-xl font-bold">
                Capturas e imágenes
              </h3>
            </div>

            {details?.screenshots?.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {details.screenshots.map((image, index) => (
                  <a
                    key={`${image}-${index}`}
                    href={image}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-white/10 bg-black/20"
                  >
                    <img
                      src={image}
                      alt={`Imagen ${index + 1} de ${game.title}`}
                      loading="lazy"
                      decoding="async"
                      className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      onError={event => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                No hay capturas disponibles en este momento.
              </p>
            )}

            <p className="mt-2 text-xs text-zinc-600">
              Las imágenes se obtienen de las fuentes disponibles para cada juego.
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            {!game.fromLibrary && (
            <button
              className={`primary-button ${adding ? 'button-loading' : ''}`}
              onClick={handleAdd}
              disabled={adding}
            >
              {adding ? (
                <>
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                  />
                  Agregando...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Agregar a mi biblioteca
                </>
              )}
            </button>
            )}

            <button
              className="secondary-button"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}