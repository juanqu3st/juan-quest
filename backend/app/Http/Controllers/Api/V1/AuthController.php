<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\JoinByCodeRequest;
use App\Http\Requests\Api\V1\Auth\LoginRequest;
use App\Http\Requests\Api\V1\Auth\RegisterStudentRequest;
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
    public function joinByCode(JoinByCodeRequest $request, GroupingService $grouping): JsonResponse
    {
        $session = $grouping->findActiveByCode($request->validated('join_code'));

        if (! $session) {
            throw ValidationException::withMessages([
                'join_code' => ['Hindi mahanap ang Join Code na ito o tapos na ang sesyon.'],
            ]);
        }

        $fullName = preg_replace('/\s+/', ' ', trim((string) $request->validated('full_name')));

        $student = DB::transaction(function () use ($session, $fullName, $grouping) {
            $existingParticipant = SessionParticipant::with('user')
                ->where('game_session_id', $session->id)
                ->whereHas('user', function ($query) use ($fullName) {
                    $query->where('role', 'student')
                        ->whereRaw('LOWER(name) = ?', [mb_strtolower($fullName)]);
                })
                ->first();

            if ($existingParticipant && $existingParticipant->user) {
                $student = $existingParticipant->user;
                $student->update([
                    'activity_status' => $student->activity_status === 'completed' ? 'completed' : 'exploring_world',
                    'last_seen_at' => now(),
                ]);

                if ($session->isGroupMode() && $existingParticipant->session_group_id === null) {
                    $grouping->assignOnJoin($session, $existingParticipant);
                }

                return $student;
            }

            if ($session->groups_locked) {
                throw ValidationException::withMessages([
                    'join_code' => ['Sarado na ang pagpapasali sa sesyon na ito. Makipag-ugnayan sa iyong guro.'],
                ]);
            }

            $student = User::create([
                'name' => $fullName,
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

            $grouping->assignOnJoin($session, $participant);

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

    public function register(RegisterStudentRequest $request): JsonResponse
    {
        $student = User::create([
            'name' => $request->validated('name'),
            'email' => $request->validated('email'),
            'password' => Hash::make($request->validated('password')),
            'role' => 'student',
            'section' => $request->validated('section'),
            'selected_character' => 'juan',
            'current_map_number' => 1,
            'activity_status' => 'exploring_world',
            'last_seen_at' => now(),
        ]);

        $token = $student->createToken('juanquest-spa')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new UserResource($student),
        ], 201);
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
