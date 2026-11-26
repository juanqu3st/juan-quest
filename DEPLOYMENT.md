# JuanQuest — Cloud Deployment Guide
**(Cloudflare Pages + Render Free + Cloudinary + TiDB Cloud + BetterStack Uptime)**

This guide deploys JuanQuest for free with zero video bandwidth hitting Render Free and full automatic Cloudinary cleanup whenever images, audio, or videos are deleted or replaced in the Teacher CMS.

---

## 1. Database — TiDB Cloud Serverless (Free)
1. Create a free Serverless cluster in **TiDB Cloud** (choose `ap-southeast-1` / Singapore for lowest latency in the Philippines).
2. Create a database named `juanquest` (or use `test` / your chosen name).
3. Copy your connection details:
   - `DB_HOST`: e.g. `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`
   - `DB_PORT`: `4000`
   - `DB_DATABASE`: `juanquest`
   - `DB_USERNAME`: your TiDB cluster username
   - `DB_PASSWORD`: your TiDB cluster password
   - `MYSQL_ATTR_SSL_CA`: `/etc/ssl/certs/ca-certificates.crt` *(already installed inside `backend/Dockerfile`)*

---

## 2. Media Storage — Cloudinary (Free 25GB)
1. Open your **Cloudinary Dashboard** and copy:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
2. **Important**: Provide both `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` (signed mode) so **deleting or replacing** any challenge image, audio, or video in the Teacher CMS **automatically deletes the old asset from Cloudinary** via the signed Destroy API!

---

## 3. Backend API — Render Web Service (Free Docker)
1. Push your repo to GitHub.
2. In **Render Dashboard** → **New +** → **Web Service** → connect your repository:
   - **Root Directory**: `backend`
   - **Runtime**: `Docker` (automatically uses `backend/Dockerfile`)
   - **Instance Type**: `Free`
   - **Health Check Path**: `/api/v1/health`
3. Add these **Environment Variables** in Render:

| Variable | Value |
| :--- | :--- |
| `APP_NAME` | `JuanQuest` |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | Generate locally via `php artisan key:generate --show` |
| `APP_URL` | `https://<your-render-service>.onrender.com` |
| `LOG_CHANNEL` | `stderr` |
| `DB_CONNECTION` | `mysql` |
| `DB_HOST` | `<your TiDB host>` |
| `DB_PORT` | `4000` |
| `DB_DATABASE` | `juanquest` |
| `DB_USERNAME` | `<your TiDB username>` |
| `DB_PASSWORD` | `<your TiDB password>` |
| `MYSQL_ATTR_SSL_CA` | `/etc/ssl/certs/ca-certificates.crt` |
| `CACHE_STORE` | `file` |
| `SESSION_DRIVER` | `array` |
| `QUEUE_CONNECTION` | `sync` |
| `FRONTEND_URL` | `https://<your-project>.pages.dev` |
| `CORS_ALLOWED_ORIGINS` | *(optional extra comma-separated domains)* |
| `MEDIA_STORAGE_DRIVER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | `<your cloud name>` |
| `CLOUDINARY_API_KEY` | `<your api key>` |
| `CLOUDINARY_API_SECRET` | `<your api secret>` |
| `SKIP_MIGRATIONS` | *(optional)* Leave unset (or `false`) so pending migrations run automatically on every deploy; set `true` only to skip boot migrations. |

4. **One-time Seed + Sync Built-in Videos & Images to Cloudinary**:
   Once TiDB + Cloudinary keys are configured, run these 2 commands **once** (either in Render Shell or from your local PC with TiDB + Cloudinary values temporarily set in `backend/.env`):
   ```bash
   php artisan migrate --force
   php artisan db:seed --force
   php artisan juanquest:sync-cloudinary
   ```
   - `juanquest:sync-cloudinary` uploads all 5 built-in story videos (`mapa1_curfew.mp4`–`mapa5_magnanakaw.mp4`) and 25 built-in challenge images straight to your Cloudinary account (`juanquest/videos` & `juanquest/challenges`) and updates the database URLs automatically!

---

## 4. Keep Render Awake — BetterStack Uptime (Free)
1. In **BetterStack Uptime** → **Create Monitor**:
   - **URL to monitor**: `https://<your-render-service>.onrender.com/api/v1/health`
   - **Expected status**: `200 OK`
   - **Check frequency**: every **5 minutes** (or 10 minutes — anything under Render's 15-minute idle threshold!)
2. Because `/api/v1/health` is lightweight (no DB hit, outside API rate limiter), Render Free stays warm and instant throughout school hours!

---

## 5. Frontend SPA — Cloudflare Pages (Free)
1. In **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
2. Add these **Environment Variables** in Cloudflare Pages:

| Variable | Value |
| :--- | :--- |
| `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com/api/v1` |
| `VITE_STORAGE_URL` | `https://<your-render-service>.onrender.com/storage` |

3. `frontend/public/_redirects` (`/* /index.html 200`) is already included so refreshing any route (`/play`, `/teacher/monitor`, `/teacher/maps`) works with zero `404` errors!
4. After Cloudflare Pages gives you your live `https://<your-project>.pages.dev` URL, double-check that `FRONTEND_URL` in Render matches it (no trailing slash).
