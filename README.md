# NotiMarket 🗳️

Plataforma de encuestas políticas basada en noticias de República Dominicana.

## Estructura del proyecto

```
Noticias/
├── notimarket/          # Frontend React + TypeScript + Vite
└── notimarket-api/      # Backend Python (FastAPI)
```

## Frontend — `notimarket/`

Aplicación React con:
- Feed de encuestas generadas automáticamente desde noticias
- Votación interactiva con resultados en tiempo real
- Panel Admin con dashboard de KPIs
- Bot interno configurable (Mock / OpenAI / Gemini)
- Filtros por tema: política, economía, salud, tecnología, educación, cultura

### Setup

```bash
cd notimarket
npm install
npm run dev
```

### Variables de entorno

```env
VITE_NEWS_API_URL=http://localhost:8001
```

## Backend — `notimarket-api/`

API minimalista en FastAPI que consume `news-intelligence-api` y entrega noticias simplificadas.

### Setup

```bash
cd notimarket-api
pip install -r requirements.txt
cp .env.example .env
python main.py
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Info de la API |
| GET | `/health` | Estado del servicio |
| GET | `/news` | Lista de noticias simplificada |
| GET | `/docs` | Swagger UI |

### Variables de entorno

```env
NEWS_API_BASE_URL=http://localhost:8000
APP_PORT=8001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Stack tecnológico

**Frontend:** React 19 · TypeScript · Vite · Zustand · Axios  
**Backend:** Python 3 · FastAPI · uvicorn · httpx · pydantic
