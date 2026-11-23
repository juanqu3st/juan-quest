# JuanQuest — Project Rules & Architecture Memory

These rules apply across all sessions in `d:\PROJECTS\JuanQuest`.

## 1. Strict Plan-First & Stop/Ask Workflow
- **Plan-First Architecture**: Before implementing multi-file features, database schemas, controllers, or 3D/frontend architecture, write out a clear plan and **stop to ask the user for confirmation or clarification** before executing.
- **Stop & Confirm at Milestones**: Never rush ahead across major phases or make assumptions on unspecified requirements. Ask the user first.

## 2. Decoupled Monorepo Architecture
- **`backend/`**: Pure Laravel 12 RESTful API (`/api/v1/*`), Sanctum token authentication, CORS configured for `http://localhost:5173`, Thin Controllers -> FormRequests -> Services -> API Resources (`app/Http/Resources/V1/`).
- **`frontend/`**: Standalone Vite + React SPA (`react-router-dom` v6, `axios`, Tailwind CSS v4, `lucide-react`, `framer-motion`, `@dnd-kit/core`, `three`, `@react-three/fiber`, `@react-three/drei`), resolving API & storage URLs via `VITE_API_BASE_URL` and `VITE_STORAGE_URL`.
- **Caching Strategy (50–100+ Students per Room/PIN)**:
  - `CACHE_STORE=file` in `backend/.env` to avoid MySQL lock contention.
  - Static lesson/map/challenge world structure cached (`juanquest:lesson:{id}:world`), invalidated on CMS updates.
  - Session PIN lookups cached (`juanquest:session:code:{CODE}`), lobby (`3s`), monitor (`4s`), and student leaderboard (`5s`) cached with explicit invalidation on map completion and group changes.
  - API rate limiter set to `180/min` (`RateLimiter::for('api')`) for classroom Wi-Fi NAT concurrency.

## 3. Build Phases & Model Workflow
- **Phase 1 — Master Prompt & Core Build (Hydrogen)**:
  - Strict Plan-First architecture.
  - 8 interconnected Laravel migrations + concurrency index migration.
  - Server-side 10-pts-per-map / 50-pts-total per-item scoring (`1 pt` per Q in Mapa 1; `2 pts` per item in Mapa 2–5) with 3-heart lifespan, 2-point minimum floor on heart depletion or timeout, and non-replayable completed maps.
  - Dynamic classroom grouping and shuffling.
  - Three.js `CatmullRomCurve3` path tracking integrated with backend state.
  - Zero Unicode emojis in UI (exclusively `lucide-react`), flat minimal HIG Teacher Workspace, warm `#FAF8F5` Student UI.
- **Phase 2 — Visual Polish & Quick Fixes (Neon)**:
  - Rapid visual iterations once running in the browser.
- **Argon**:
  - Skip for this project; Hydrogen covers the required application security.

## 4. Environment & Database (XAMPP MySQL)
- **Database Engine**: XAMPP MySQL on **`127.0.0.1:3307`** (`DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3307`, `DB_DATABASE=juanquest`, `DB_USERNAME=root`, empty password).
- Do not switch back to SQLite or port 3306 unless the user explicitly asks.

## 5. Non-Negotiable Security & Integrity Rules
- **Never leak answers**: `correct_answer` must NEVER be serialized into API responses or student-accessible payloads (`Challenge::$hidden = ['correct_answer']`, omitted in `ChallengeResource`).
- **Server-authoritative math**: All score calculations (10 pts/map, 50 pts total, per-item scoring + 3-heart lifespan + 2-pt floor), group/shuffle assignments, and progression state must be computed and validated server-side.
