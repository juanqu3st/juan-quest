#!/usr/bin/env sh
set -e

# Adapt Apache listener dynamically to Render's $PORT (defaults to 8080)
PORT="${PORT:-8080}"
sed -ri "s/Listen [0-9]+/Listen ${PORT}/g" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/g" /etc/apache2/sites-available/000-default.conf

# Ensure runtime writable directories
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

# Symlink public storage if not present
php artisan storage:link --force >/dev/null 2>&1 || true

# Cache configuration & routes for fast production response times
php artisan config:clear >/dev/null 2>&1 || true
php artisan config:cache
php artisan route:cache

# Run any pending idempotent DB migrations automatically on startup unless explicitly skipped
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
    php artisan migrate --force
fi

exec apache2-foreground
