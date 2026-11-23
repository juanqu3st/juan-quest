<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RenameGroupRequest;
use App\Http\Requests\Api\V1\Teacher\StoreSessionRequest;
use App\Http\Resources\V1\GameSessionResource;
use App\Models\GameSession;
use App\Models\Lesson;
use App\Models\SessionGroup;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
