<?php

namespace App\Http\Controllers\Api\V1\Student;

use App\Http\Controllers\Controller;
use App\Http\Resources\V1\LessonResource;
use App\Http\Resources\V1\MapResource;
use App\Models\Lesson;
use App\Models\SessionParticipant;
use App\Models\StudentProgress;
use App\Services\OfflineQrService;
use App\Services\RankingMonitorService;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorldMapController extends Controller
{
    public function index(Request $request, ScoringService $scoring, RankingMonitorService $monitor): JsonResponse
    {
        $student = $request->user();

        $progressByMap = StudentProgress::where('user_id', $student->id)
            ->get()
            ->keyBy('map_id');

        $hasActiveAttempt = $progressByMap->contains(fn ($p) => ! $p->is_completed);
        $nextStatus = $student->activity_status === 'completed'
            ? 'completed'
            : ($hasActiveAttempt ? 'in_game' : 'exploring_world');

        if (
            $student->activity_status !== $nextStatus
            || ! $student->last_seen_at
            || $student->last_seen_at->lt(now()->subSeconds(25))
        ) {
            $student->update([
                'activity_status' => $nextStatus,
                'last_seen_at' => now(),
            ]);
        }

        $participation = SessionParticipant::with(['gameSession', 'sessionGroup'])
            ->where('user_id', $student->id)
            ->latest('joined_at')
            ->first();

        $gameSession = $participation?->gameSession;
        $isGroupMode = $gameSession?->isGroupMode() ?? false;

        $lessonId = $gameSession?->lesson_id
            ?? Lesson::where('is_active', true)->value('id')
            ?? Lesson::value('id');

        $lesson = $lessonId ? $scoring->getCachedLessonWorld($lessonId) : null;

        $mapsPayload = $lesson
            ? $lesson->maps->map(function ($map) use ($progressByMap, $request) {
                $resource = new MapResource($map);
                $resource->additional(['progress' => $progressByMap->get($map->id)]);

                return $resource->toArray($request);
            })->values()
            : [];

        $totalScore = $progressByMap->where('is_completed', true)->sum('score');
        $completedCount = $progressByMap->where('is_completed', true)->count();
        $maxTotalScore = $lesson ? (int) $lesson->maps->sum('perfect_score') : 50;

        return response()->json([
            'lesson' => $lesson ? new LessonResource($lesson) : null,
            'maps' => $mapsPayload,
            'total_score' => $totalScore,
            'max_total_score' => $maxTotalScore > 0 ? $maxTotalScore : 50,
            'completed_count' => $completedCount,
            'session' => $gameSession ? [
                'id' => $gameSession->id,
                'join_code' => $gameSession->join_code,
                'class_name' => $gameSession->class_name,
                'play_mode' => $gameSession->play_mode ?? 'group',
                'status' => $gameSession->status,
                'group_id' => $isGroupMode ? $participation->sessionGroup?->id : null,
                'group_name' => $isGroupMode ? $participation->sessionGroup?->group_name : null,
                'group_number' => $isGroupMode ? $participation->sessionGroup?->group_number : null,
                'member_names' => $isGroupMode ? $participation->sessionGroup?->member_names : null,
                'leader_name' => $student->name,
                'offline_qr_key' => app(OfflineQrService::class)->sessionQrKey($gameSession),
                'can_rename_group' => $isGroupMode
                    && $gameSession->status === 'waiting'
                    && $participation->sessionGroup !== null,
            ] : null,
            'leaderboard' => $monitor->getStudentLeaderboard($gameSession),
        ]);
    }

    public function leaderboard(Request $request, RankingMonitorService $monitor): JsonResponse
    {
        $session = SessionParticipant::with('gameSession')
            ->where('user_id', $request->user()->id)
            ->latest('joined_at')
            ->first()?->gameSession;

        return response()->json($monitor->getStudentLeaderboard($session));
    }
}
