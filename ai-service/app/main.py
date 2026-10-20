import os
import re
import secrets
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="GameTrack Recommendation Service", version="2.0.0")

class HistoryItem(BaseModel):
    game_id: str
    title: str = Field(max_length=160)
    genre: str = Field(max_length=500)
    platform: str = Field(max_length=1000)
    status: str = Field(max_length=20)
    hours_played: float = Field(ge=0, le=100000)

class CatalogItem(BaseModel):
    game_id: str
    title: str = Field(max_length=160)
    genre: str = Field(max_length=500)
    platform: str = Field(max_length=1000)
    external_id: str | None = Field(default=None, max_length=100)
    cover_url: str | None = Field(default=None, max_length=1000)

class RecommendationRequest(BaseModel):
    history: list[HistoryItem] = Field(max_length=500)
    catalog: list[CatalogItem] = Field(max_length=500)

def split_values(value: str):
    return {item.strip().lower() for item in re.split(r',|\||;', value or '') if item.strip()}

def genre_values(value: str):
    return split_values(value)

@app.get("/health")
def health():
    return {"status": "ok", "service": "gametrack-ai"}

@app.post("/recommend")
def recommend(payload: RecommendationRequest, x_api_key: str | None = Header(default=None)):
    expected = os.getenv("AI_SERVICE_API_KEY", "")
    if not expected or not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="No autorizado")

    played_ids = {item.game_id for item in payload.history}
    played_titles = {item.title.strip().lower() for item in payload.history}
    candidates = [g for g in payload.catalog if g.game_id not in played_ids and g.title.strip().lower() not in played_titles]
    if not payload.history or not candidates:
        return {"method": "tfidf-cosine", "message": "Agrega juegos a tu biblioteca para recibir recomendaciones.", "recommendations": []}

    def features(game):
        genres = sorted(genre_values(game.genre))
        platforms = sorted(split_values(game.platform))
        return " ".join(["genero_" + re.sub(r"\W+", "_", x) for x in genres for _ in range(3)] + ["plataforma_" + re.sub(r"\W+", "_", x) for x in platforms]) or "sin_datos"

    corpus = [features(g) for g in payload.history] + [features(g) for g in candidates]
    vectors = TfidfVectorizer(token_pattern=r"(?u)\b\w+\b").fit_transform(corpus)
    history_vectors = vectors[:len(payload.history)]
    candidate_vectors = vectors[len(payload.history):]
    weights = []
    for game in payload.history:
        status_weight = {"jugando": 3, "completado": 2, "pendiente": 1, "abandonado": 0.2}.get(game.status, 1)
        weights.append(status_weight + min(game.hours_played / 20, 3))
    similarities = cosine_similarity(candidate_vectors, history_vectors)
    ranked = []
    for index, game in enumerate(candidates):
        score = float(sum(similarities[index][j] * weights[j] for j in range(len(weights))) / max(sum(weights), 1))
        if score <= 0:
            continue
        ranked.append({
            "game_id": game.game_id,
            "title": game.title,
            "genre": game.genre,
            "platform": game.platform,
            "external_id": game.external_id,
            "cover_url": game.cover_url,
            "score": round(score, 4),
            "reason": "Recomendado por similitud de géneros y plataformas con tu biblioteca."
        })
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return {
        "method": "tfidf-cosine",
        "message": "Recomendaciones calculadas mediante TF-IDF y similitud del coseno.",
        "recommendations": ranked[:12]
    }
