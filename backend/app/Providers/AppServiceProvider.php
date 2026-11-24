<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Classroom NAT friendly limit: 180 req/min per authenticated user or IP for 50-100 student rooms
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(180)->by($request->user()?->id ?: $request->ip());
        });

        // Strict brute-force protection on email/password login (teacher portal)
        RateLimiter::for('login', function (Request $request) {
            $key = strtolower(trim((string) $request->input('email'))).'|'.$request->ip();

            return Limit::perMinute(10)->by($key);
        });
    }
}
