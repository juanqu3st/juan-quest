<?php

namespace App\Http\Controllers\Api\V1\Student;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Student\JoinSessionRequest;
use App\Models\SessionParticipant;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class SessionJoinController extends Controller
{
    public function store(JoinSessionRequest $request, GroupingService $grouping): JsonResponse
    {
        $session = $grouping->findActiveByCode($request->validated('join_code'));

        if (! $session) {
            throw ValidationException::withMessages([
                'join_code' => ['Hindi mahanap ang Join Code o sarado na ang sesyon.'],
            ]);
        }

        $participant = SessionParticipant::where('game_session_id', $session->id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $participant) {
            if ($session->groups_locked) {
                throw ValidationException::withMessages([
                    'join_code' => ['Sarado na ang pagpapasali sa sesyon na ito. Makipag-ugnayan sa iyong guro.'],
                ]);
            }

            $participant = SessionParticipant::create([
                'game_session_id' => $session->id,
                'user_id' => $request->user()->id,
                'joined_at' => now(),
            ]);
        }

        $grouping->assignOnJoin($session, $participant);
        $participant->load('sessionGroup');

        return response()->json([
            'session' => [
                'id' => $session->id,
                'join_code' => $session->join_code,
                'class_name' => $session->class_name,
                'play_mode' => $session->play_mode ?? 'group',
                'group_name' => $participant->sessionGroup?->group_name,
                'member_names' => $participant->sessionGroup?->member_names,
            ],
        ]);
    }
}
