<?php

namespace App\Http\Controllers\Api\V1\Student;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RenameGroupRequest;
use App\Http\Requests\Api\V1\Student\StartMapAttemptRequest;
use App\Http\Requests\Api\V1\Student\SubmitChallengeRequest;
use App\Http\Requests\Api\V1\Student\UpdateCharacterRequest;
use App\Http\Resources\V1\ProgressResource;
use App\Models\Challenge;
use App\Models\Map;
use App\Models\SessionParticipant;
use App\Services\GroupingService;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GameplayController extends Controller
{
    public function start(StartMapAttemptRequest $request, Map $map, ScoringService $scoring): JsonResponse
    {
        $progress = $scoring->startAttempt(
            $request->user(),
            $map,
            $request->validated('chosen_time_limit')
        );

        return response()->json([
            'progress' => new ProgressResource($progress),
            'projected_score' => $scoring->getCurrentEarnedPoints($progress, $map),
            'max_score' => (int) $map->perfect_score,
        ]);
    }

    public function sync(Request $request, Map $map, ScoringService $scoring): JsonResponse
    {
        $validated = $request->validate([
            'elapsed_seconds' => ['required', 'integer', 'min:0', 'max:3600'],
        ]);

        $progress = $scoring->syncElapsedTime(
            $request->user(),
            $map,
            (int) $validated['elapsed_seconds']
        );

        return response()->json([
            'progress' => $progress ? new ProgressResource($progress) : null,
        ]);
    }

    public function submit(SubmitChallengeRequest $request, Map $map, ScoringService $scoring): JsonResponse
    {
        $challenge = Challenge::findOrFail($request->validated('challenge_id'));

        $result = $scoring->submitAnswer(
            $request->user(),
            $map,
            $challenge,
            $request->validated('submission'),
            (int) ($request->validated('elapsed_seconds') ?? 0)
        );

        return response()->json($result);
    }

    public function lifeline(Request $request, Map $map, ScoringService $scoring): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'in:use_heart,skip'],
        ]);

        return response()->json(
            $scoring->resolveLifeline($request->user(), $map, (string) $validated['action'])
        );
    }

    public function timeout(Request $request, Map $map, ScoringService $scoring): JsonResponse
    {
        return response()->json($scoring->handleTimeout($request->user(), $map));
    }

    public function updateCharacter(UpdateCharacterRequest $request): JsonResponse
    {
        $request->user()->update([
            'selected_character' => $request->validated('selected_character'),
            'last_seen_at' => now(),
        ]);

        return response()->json([
            'selected_character' => $request->validated('selected_character'),
        ]);
    }

    public function updateStatus(Request $request, ScoringService $scoring): JsonResponse
    {
        $validated = $request->validate([
            'activity_status' => ['required', 'in:idle,exploring_world,viewing_scene_guide,in_game,completed'],
        ]);

        $user = $request->user();
        $nextStatus = ($user->activity_status === 'completed' && $validated['activity_status'] === 'exploring_world')
            ? 'completed'
            : $validated['activity_status'];

        $user->update([
            'activity_status' => $nextStatus,
            'last_seen_at' => now(),
        ]);

        $sessionId = SessionParticipant::where('user_id', $user->id)->latest('joined_at')->value('game_session_id');
        $scoring->invalidateSessionTelemetry($sessionId);

        return response()->json(['activity_status' => $user->activity_status]);
    }

    public function renameGroup(RenameGroupRequest $request, GroupingService $grouping): JsonResponse
    {
        $participation = SessionParticipant::with(['sessionGroup.gameSession'])
            ->where('user_id', $request->user()->id)
            ->latest('joined_at')
            ->first();

        if (! $participation || ! $participation->sessionGroup) {
            return response()->json([
                'message' => 'Walang pangkat na maaaring i-edit sa sesyon na ito.',
            ], 422);
        }

        $updatedGroup = $grouping->renameGroup(
            $participation->sessionGroup,
            (string) $request->validated('group_name'),
            $request->validated('member_names'),
            $request->has('member_names'),
            false
        );

        return response()->json([
            'group_id' => $updatedGroup->id,
            'group_name' => $updatedGroup->group_name,
            'group_number' => $updatedGroup->group_number,
            'member_names' => $updatedGroup->member_names,
        ]);
    }
}
