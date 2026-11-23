<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RenameGroupRequest;
use App\Http\Requests\Api\V1\Teacher\StoreSessionRequest;
use App\Http\Resources\V1\GameSessionResource;
use App\Models\GameSession;
use App\Models\Lesson;
use App\Models\SessionGroup;
use App\Models\SessionParticipant;
use App\Models\StudentProgress;
use App\Models\User;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class SessionGroupingController extends Controller
{
    public function index(): JsonResponse
    {
        $sessions = GameSession::with('lesson:id,title')->orderByDesc('id')->get();
        $lessons = Lesson::select('id', 'title')->get();

        return response()->json([
            'sessions' => GameSessionResource::collection($sessions),
            'lessons' => $lessons,
        ]);
    }

    public function store(StoreSessionRequest $request, GroupingService $grouping): JsonResponse
    {
        $session = $grouping->createSession($request->user()->id, $request->validated());

        return response()->json([
            'session' => $grouping->getCachedLobbyPayload($session),
        ], 201);
    }

    public function show(GameSession $session, GroupingService $grouping): JsonResponse
    {
        return response()->json([
            'session' => $grouping->getCachedLobbyPayload($session),
        ]);
    }

    public function destroy(GameSession $session, GroupingService $grouping): JsonResponse
    {
        $sessionId = $session->id;
        $joinCode = strtoupper(trim((string) $session->join_code));

        DB::transaction(function () use ($session, $sessionId) {
            $participantUserIds = SessionParticipant::where('game_session_id', $sessionId)
                ->pluck('user_id')
                ->unique()
                ->values();

            StudentProgress::where('game_session_id', $sessionId)->delete();
            SessionParticipant::where('game_session_id', $sessionId)->delete();
            SessionGroup::where('game_session_id', $sessionId)->delete();
            $session->delete();

            if ($participantUserIds->isNotEmpty()) {
                $stillReferencedIds = SessionParticipant::whereIn('user_id', $participantUserIds)
                    ->pluck('user_id')
                    ->unique();
                $orphanGuestIds = $participantUserIds->diff($stillReferencedIds);

                if ($orphanGuestIds->isNotEmpty()) {
                    User::whereIn('id', $orphanGuestIds)
                        ->where('role', 'student')
                        ->whereNull('email')
                        ->delete();
                }
            }
        });

        $grouping->forgetSessionCaches($session);
        if ($joinCode !== '') {
            Cache::forget("juanquest:session:code:{$joinCode}");
        }

        return response()->json([
            'ok' => true,
            'deleted_id' => $sessionId,
        ]);
    }

    public function toggleLock(GameSession $session, GroupingService $grouping): JsonResponse
    {
        $session->update(['groups_locked' => ! $session->groups_locked]);
        $grouping->forgetSessionCaches($session);

        return response()->json([
            'session' => $grouping->getCachedLobbyPayload($session->fresh()),
        ]);
    }

    public function updateStatus(Request $request, GameSession $session, GroupingService $grouping): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:waiting,active,finished'],
        ]);

        $session->update(['status' => $validated['status']]);
        $grouping->forgetSessionCaches($session);

        return response()->json([
            'session' => $grouping->getCachedLobbyPayload($session->fresh()),
        ]);
    }

    public function renameGroup(RenameGroupRequest $request, SessionGroup $group, GroupingService $grouping): JsonResponse
    {
        $group->loadMissing('gameSession');
        $session = $group->gameSession;

        $updatedGroup = $grouping->renameGroup(
            $group,
            (string) $request->validated('group_name'),
            $request->validated('member_names'),
            $request->has('member_names'),
            true
        );

        return response()->json([
            'group' => [
                'id' => $updatedGroup->id,
                'group_number' => $updatedGroup->group_number,
                'group_name' => $updatedGroup->group_name,
                'member_names' => $updatedGroup->member_names,
            ],
            'session' => $session ? $grouping->getCachedLobbyPayload($session->fresh()) : null,
        ]);
    }
}
