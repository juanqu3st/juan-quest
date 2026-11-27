<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\MediaStreamController;
use App\Http\Controllers\Api\V1\OfflinePackController;
use App\Http\Controllers\Api\V1\Student\GameplayController;
use App\Http\Controllers\Api\V1\Student\SessionJoinController;
use App\Http\Controllers\Api\V1\Student\WorldMapController;
use App\Http\Controllers\Api\V1\Teacher\CmsChallengeController;
use App\Http\Controllers\Api\V1\Teacher\CmsLessonController;
use App\Http\Controllers\Api\V1\Teacher\CmsMapController;
use App\Http\Controllers\Api\V1\Teacher\MonitorRankingController;
use App\Http\Controllers\Api\V1\Teacher\SessionGroupingController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Lightweight unthrottled health check for Render & BetterStack Uptime pinging
    Route::get('/health', static function () {
        return response()->json([
            'status' => 'ok',
            'service' => 'juanquest-api',
            'timestamp' => now()->toIso8601String(),
        ]);
    });

    // CORS-safe public media streaming (outside API throttle to prevent school Wi-Fi NAT 429s)
    Route::get('/media/{path}', [MediaStreamController::class, 'show'])->where('path', '.*');

    // Public cacheable PWA Offline Pack (hashed answers only — zero plain-text correct_answer)
    Route::get('/offline/pack', [OfflinePackController::class, 'show']);
});

Route::prefix('v1')->middleware('throttle:api')->group(function () {
    // Public Auth Routes
    Route::get('/auth/session-preview', [AuthController::class, 'previewSession']);
    Route::post('/auth/join', [AuthController::class, 'joinByCode']);
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

    // Authenticated Sanctum Routes
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // Student API Routes
        Route::middleware('role:student')->prefix('student')->group(function () {
            Route::get('/world', [WorldMapController::class, 'index']);
            Route::get('/leaderboard', [WorldMapController::class, 'leaderboard']);
            Route::post('/join-session', [SessionJoinController::class, 'store']);
            Route::post('/character', [GameplayController::class, 'updateCharacter']);
            Route::post('/status', [GameplayController::class, 'updateStatus']);
            Route::patch('/group-name', [GameplayController::class, 'renameGroup']);
            Route::post('/maps/{map}/start', [GameplayController::class, 'start']);
            Route::post('/maps/{map}/sync', [GameplayController::class, 'sync']);
            Route::post('/maps/{map}/submit', [GameplayController::class, 'submit']);
            Route::post('/maps/{map}/lifeline', [GameplayController::class, 'lifeline']);
            Route::post('/maps/{map}/timeout', [GameplayController::class, 'timeout']);
        });

        // Teacher API Routes
        Route::middleware('role:teacher')->prefix('teacher')->group(function () {
            Route::get('/sessions', [SessionGroupingController::class, 'index']);
            Route::post('/sessions', [SessionGroupingController::class, 'store']);
            Route::get('/sessions/{session}', [SessionGroupingController::class, 'show']);
            Route::delete('/sessions/{session}', [SessionGroupingController::class, 'destroy']);
            Route::post('/sessions/{session}/lock', [SessionGroupingController::class, 'toggleLock']);
            Route::post('/sessions/{session}/status', [SessionGroupingController::class, 'updateStatus']);
            Route::patch('/groups/{group}', [SessionGroupingController::class, 'renameGroup']);

            Route::get('/sessions/{session}/monitor', [MonitorRankingController::class, 'show']);
            Route::post('/sessions/{session}/offline-import', [MonitorRankingController::class, 'importOfflineResult']);
            Route::post('/sessions/{session}/participants/{student}/reset', [MonitorRankingController::class, 'resetParticipant']);
            Route::get('/sessions/{session}/export', [MonitorRankingController::class, 'export']);

            Route::get('/cms', [CmsLessonController::class, 'index']);
            Route::post('/cms/lessons/{lesson}', [CmsLessonController::class, 'update']);
            Route::put('/cms/maps/{map}', [CmsMapController::class, 'update']);
            Route::post('/cms/maps/{map}', [CmsMapController::class, 'update']);
            Route::post('/cms/maps/{map}/challenges', [CmsChallengeController::class, 'store']);
            Route::post('/cms/challenges/{challenge}', [CmsChallengeController::class, 'update']);
            Route::delete('/cms/challenges/{challenge}', [CmsChallengeController::class, 'destroy']);
        });
    });
});
