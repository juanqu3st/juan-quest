<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\JoinByCodeRequest;
use App\Http\Requests\Api\V1\Auth\LoginRequest;
use App\Http\Resources\V1\UserResource;
use App\Models\SessionParticipant;
use App\Models\User;
use App\Services\GroupingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function previewSession(Request $request, GroupingService $grouping): JsonResponse
    {
        $code = strtoupper(trim((string) $request->query('join_code', '')));

        if (mb_strlen($code) < 2 || mb_strlen($code) > 16) {
            return response()->json(['found' => false]);
        }

        $session = $grouping->findActiveByCode($code);

        if (! $session) {
            return response()->json(['found' => false]);
        }

        return response()->json([
            'found' => true,
            'join_code' => $session->join_code,
            'class_name' => $session->class_name,
            'play_mode' => $session->play_mode ?? 'group',
            'status' => $session->status,
            'groups_locked' => (bool) $session->groups_locked,
        ]);
    }

    public function joinByCode(JoinByCodeRequest $request, GroupingService $grouping): JsonResponse
    {
        $session = $grouping->findActiveByCode($request->validated('join_code'));

        if (! $session) {
            throw ValidationException::withMessages([
                'join_code' => ['Hindi mahanap ang Join Code na ito o tapos na ang sesyon.'],
            ]);
        }

        $isGroupMode = $session->isGroupMode();
        $isDirectGroupPayload = $request->has('group_name') || $request->has('member_names');
        $groupName = preg_replace('/\s+/', ' ', trim((string) ($request->validated('group_name') ?? '')));
        $memberNames = preg_replace('/\s+/', ' ', trim((string) ($request->validated('member_names') ?? '')));
        $fullName = preg_replace('/\s+/', ' ', trim((string) ($request->validated('full_name') ?? '')));

        if ($isGroupMode) {
            $lookupName = $groupName !== '' ? $groupName : $fullName;
            if (mb_strlen($lookupName) < 2) {
                throw ValidationException::withMessages([
                    ($isDirectGroupPayload ? 'group_name' : 'full_name') => [
                        'Ilagay ang pangalan ng pangkat (hindi bababa sa 2 letra).',
                    ],
                ]);
            }
        } else {
            $lookupName = $fullName !== '' ? $fullName : $groupName;
            if (mb_strlen($lookupName) < 2) {
                throw ValidationException::withMessages([
                    'full_name' => ['Ilagay ang iyong pangalan (hindi bababa sa 2 letra).'],
                ]);
            }
        }

        $student = DB::transaction(function () use (
            $session,
            $isGroupMode,
            $isDirectGroupPayload,
            $groupName,
            $memberNames,
            $lookupName,
            $grouping
        ) {
            $existingParticipant = null;

            if ($isGroupMode) {
                // Match by session_groups.group_name first, then fall back to legacy users.name
                // so previously joined classroom groups (e.g. Grade 7 - Sampaguita) reconnect cleanly.
                $existingParticipant = SessionParticipant::with(['user', 'sessionGroup'])
                    ->where('game_session_id', $session->id)
                    ->whereHas('sessionGroup', function ($query) use ($lookupName) {
                        $query->whereRaw('LOWER(group_name) = ?', [mb_strtolower($lookupName)]);
                    })
                    ->first();
            }

            if (! $existingParticipant) {
                $existingParticipant = SessionParticipant::with(['user', 'sessionGroup'])
                    ->where('game_session_id', $session->id)
                    ->whereHas('user', function ($query) use ($lookupName) {
                        $query->where('role', 'student')
                            ->whereRaw('LOWER(name) = ?', [mb_strtolower($lookupName)]);
                    })
                    ->first();
            }

            if ($existingParticipant && $existingParticipant->user) {
                $student = $existingParticipant->user;

                // Protect password-registered student accounts from guest PIN+name takeover
                if ($student->password !== null) {
                    throw ValidationException::withMessages([
                        ($isGroupMode && $isDirectGroupPayload ? 'group_name' : 'full_name') => [
                            'May nakarehistrong account na gumagamit ng pangalang ito. Mag-sign in gamit ang email at password.',
                        ],
                    ]);
                }

                $student->update([
                    'activity_status' => $student->activity_status === 'completed' ? 'completed' : 'exploring_world',
                    'last_seen_at' => now(),
                ]);

                if ($isGroupMode) {
                    if ($existingParticipant->session_group_id === null) {
                        $grouping->assignOnJoin(
                            $session,
                            $existingParticipant,
                            $groupName !== '' ? $groupName : null,
                            $memberNames !== '' ? $memberNames : null
                        );
                    } elseif ($memberNames !== '' && $existingParticipant->sessionGroup && empty($existingParticipant->sessionGroup->member_names)) {
                        $existingParticipant->sessionGroup->update([
                            'member_names' => mb_substr($memberNames, 0, 400),
                        ]);
                        $grouping->forgetSessionCaches($session);
                    }
                }

                return $student;
            }

            if ($session->groups_locked) {
                throw ValidationException::withMessages([
                    'join_code' => ['Sarado na ang pagpapasali sa sesyon na ito. Makipag-ugnayan sa iyong guro.'],
                ]);
            }

            if ($isGroupMode && $isDirectGroupPayload && mb_strlen($memberNames) < 2) {
                throw ValidationException::withMessages([
                    'member_names' => ['Ilagay ang mga miyembro ng pangkat (kasama ang humahawak ng device).'],
                ]);
            }

            $student = User::create([
                'name' => mb_substr($lookupName, 0, 80),
                'email' => null,
                'password' => null,
                'role' => 'student',
                'section' => $session->class_name,
                'selected_character' => 'juan',
                'current_map_number' => 1,
                'activity_status' => 'exploring_world',
                'last_seen_at' => now(),
            ]);

            $participant = SessionParticipant::create([
                'game_session_id' => $session->id,
                'user_id' => $student->id,
                'joined_at' => now(),
            ]);

            $grouping->assignOnJoin(
                $session,
                $participant,
                $isGroupMode && $groupName !== '' ? $groupName : null,
                $isGroupMode && $memberNames !== '' ? $memberNames : null
            );

            return $student;
        });

        $token = $student->createToken('juanquest-spa')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new UserResource($student->fresh()),
        ]);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->validated('email'))->first();

        if (! $user || ! $user->password || ! Hash::check($request->validated('password'), $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Mali ang email o password.'],
            ]);
        }

        $user->update([
            'activity_status' => $user->isStudent()
                ? ($user->activity_status === 'completed' ? 'completed' : 'exploring_world')
                : 'idle',
            'last_seen_at' => now(),
        ]);

        $token = $user->createToken('juanquest-spa')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new UserResource($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => new UserResource($request->user()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->update(['activity_status' => 'idle', 'last_seen_at' => now()]);
        $user->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }
}
