<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Models\GameSession;
use App\Services\RankingMonitorService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MonitorRankingController extends Controller
{
    public function show(GameSession $session, RankingMonitorService $monitor): JsonResponse
    {
        return response()->json([
            'monitor' => $monitor->getMonitorData($session),
        ]);
    }

    public function export(GameSession $session, RankingMonitorService $monitor): StreamedResponse
    {
        return $monitor->exportCsv($session);
    }
}
