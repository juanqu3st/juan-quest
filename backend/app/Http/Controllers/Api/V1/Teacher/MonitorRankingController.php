<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Models\GameSession;
use App\Services\OfflineQrService;
use App\Services\RankingMonitorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MonitorRankingController extends Controller
{
    public function show(GameSession $session, RankingMonitorService $monitor): JsonResponse
    {
        return response()->json([
            'monitor' => $monitor->getMonitorData($session),
        ]);
    }

    public function importOfflineResult(
        Request $request,
        GameSession $session,
        OfflineQrService $offlineQr,
        RankingMonitorService $monitor
    ): JsonResponse {
        $validated = $request->validate([
            'qr_payload' => ['required', 'array'],
            'allow_manual' => ['sometimes', 'boolean'],
        ]);

        $imported = $offlineQr->importResult(
            $session,
            $validated['qr_payload'],
            (bool) ($validated['allow_manual'] ?? false)
        );

        return response()->json([
            'imported' => $imported,
            'monitor' => $monitor->getMonitorData($session),
        ]);
    }

    public function export(GameSession $session, RankingMonitorService $monitor): StreamedResponse
    {
        return $monitor->exportCsv($session);
    }
}
