<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Models\GameSession;
use App\Models\Map;
use App\Models\SessionParticipant;
use App\Models\StudentProgress;
use App\Models\User;
use App\Services\GroupingService;
use App\Services\OfflineQrService;
use App\Services\RankingMonitorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

    /**
     * Teacher-authorized retake for an online student/group: resets either a single map (1..5)
     * or full 5-map progress cleanly in place without creating duplicate groups.
     */
    public function resetParticipant(
        Request $request,
        GameSession $session,
        User $student,
        GroupingService $grouping,
        RankingMonitorService $monitor
    ): JsonResponse {
        $validated = $request->validate([
            'map_number' => ['nullable', 'integer', 'min:1', 'max:5'],
        ]);

        $isMember = SessionParticipant::where('game_session_id', $session->id)
            ->where('user_id', $student->id)
            ->exists();

        if (! $isMember) {
            return response()->json([
                'message' => 'Hindi kabilang sa sesyong ito ang napiling pangkat o mag-aaral.',
            ], 404);
        }

        $mapNumber = isset($validated['map_number']) ? (int) $validated['map_number'] : null;

        DB::transaction(function () use ($session, $student, $mapNumber) {
            if ($mapNumber === null) {
                StudentProgress::where('user_id', $student->id)->delete();
                $student->update([
                    'current_map_number' => 1,
                    'activity_status' => 'exploring_world',
                ]);

                return;
            }

            $map = Map::where('lesson_id', $session->lesson_id)
                ->where('map_number', $mapNumber)
                ->first();

            if ($map) {
                StudentProgress::where('user_id', $student->id)
                    ->where('map_id', $map->id)
                    ->delete();
            }

            $student->update([
                'current_map_number' => max((int) $student->current_map_number, $mapNumber),
                'activity_status' => 'exploring_world',
            ]);
        });

        $grouping->forgetSessionCaches($session);

        return response()->json([
            'ok' => true,
            'reset_map_number' => $mapNumber,
            'monitor' => $monitor->getMonitorData($session),
        ]);
    }

    public function export(GameSession $session, RankingMonitorService $monitor): StreamedResponse
    {
        return $monitor->exportCsv($session);
    }
}
