<?php

$extraOrigins = array_values(array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))
)));

$allowedOrigins = array_values(array_unique(array_filter([
    env('FRONTEND_URL', 'http://localhost:5173'),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...$extraOrigins,
])));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $allowedOrigins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => ['Content-Disposition'],
    'max_age' => 86400,
    'supports_credentials' => false,
];
