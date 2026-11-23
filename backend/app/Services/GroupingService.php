<?php

namespace App\Services;

use App\Models\GameSession;
use App\Models\SessionGroup;
use App\Models\SessionParticipant;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GroupingService
{
    public function findActiveByCode(string $joinCode): ?GameSession
    {
        $code = strtoupper(trim($joinCode));

        return Cache::remember("juanquest:session:code:{$code}", now()->addMinutes(5), function () use ($code) {
            return GameSession::where('join_code', $code)
                ->whereIn('status', ['waiting', 'active'])
                ->first();
        });
    }

    public function forgetSessionCaches(GameSession $session): void
    {
        Cache::forget("juanquest:session:code:{$session->join_code}");
        Cache::forget("juanquest:session:{$session->id}:lobby");
        Cache::forget("juanquest:session:{$session->id}:monitor");
        Cache::forget("juanquest:session:{$session->id}:leaderboard");
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function createSession(int $teacherId, array $data): GameSession
    {
        $joinCode = ! empty($data['join_code'])
            ? strtoupper((string) preg_replace('/\s+/', '', (string) $data['join_code']))
            : $this->generateUniqueCode();

        $playMode = ($data['play_mode'] ?? 'group') === 'individual' ? 'individual' : 'group';

        $session = GameSession::create([
            'teacher_id' => $teacherId,
            'lesson_id' => $data['lesson_id'],
            'join_code' => $joinCode,
            'class_name' => $data['class_name'],
            'play_mode' => $playMode,
            'members_per_group' => 1,
            'groups_locked' => false,
            'status' => 'waiting',
        ]);

        $this->forgetSessionCaches($session);

        return $session;
    }

    /**
     * Group mode (1 device = 1 Pangkat): automatically creates Pangkat 1, 2, 3... for each joining device.
     * Individual mode: leaves session_group_id null (pure solo gameplay).
     */
    public function assignOnJoin(GameSession $session, SessionParticipant $participant): void
    {
        if (! $session->isGroupMode()) {
            $this->forgetSessionCaches($session);

            return;
        }

        if ($participant->session_group_id !== null) {
            $this->forgetSessionCaches($session);

            return;
        }

        DB::transaction(function () use ($session, $participant) {
            $lockedSession = GameSession::where('id', $session->id)->lockForUpdate()->firstOrFail();
            $nextNumber = ((int) $lockedSession->groups()->max('group_number')) + 1;

            $group = SessionGroup::create([
                'game_session_id' => $lockedSession->id,
                'group_number' => $nextNumber,
                'group_name' => "Pangkat {$nextNumber}",
                'member_names' => null,
            ]);

            $participant->update(['session_group_id' => $group->id]);
        });

        $this->forgetSessionCaches($session);
    }

    public function renameGroup(
        SessionGroup $group,
        string $newName,
        ?string $memberNames = null,
        bool $updateMembers = false,
        bool $byTeacher = false
    ): SessionGroup {
        $group->loadMissing('gameSession');
        $session = $group->gameSession;

        if (! $byTeacher) {
            if (! $session || ! $session->isGroupMode()) {
                throw ValidationException::withMessages([
                    'group_name' => 'Walang pangkat sa indibidwal na sesyon na ito.',
                ]);
            }

            if ($session->status !== 'waiting') {
                throw ValidationException::withMessages([
                    'group_name' => 'Naka-lock na ang pangalan ng pangkat dahil nagsimula o natapos na ang laro.',
                ]);
            }
        }

        $cleanedName = (string) preg_replace('/\s+/', ' ', trim($newName));
        $payload = ['group_name' => $cleanedName];

        if ($updateMembers) {
            $cleanedMembers = is_string($memberNames) ? trim($memberNames) : null;
            $payload['member_names'] = ($cleanedMembers === '' || $cleanedMembers === null) ? null : $cleanedMembers;
        }

        $group->update($payload);

        if ($session) {
            $this->forgetSessionCaches($session);
        }

        return $group->fresh();
    }

    /**
     * Cached 3-second lobby payload for classroom rooms.
     *
     * @return array<string, mixed>
     */
    public function getCachedLobbyPayload(GameSession $session): array
    {
        return Cache::remember("juanquest:session:{$session->id}:lobby", now()->addSeconds(3), function () use ($session) {
            $fresh = GameSession::with([
                'lesson:id,title',
                'groups.participants.user:id,name,section,current_map_number,activity_status',
                'participants.user:id,name,section,current_map_number,activity_status',
            ])->findOrFail($session->id);

            $playMode = $fresh->play_mode ?? 'group';

            return [
                'id' => $fresh->id,
                'join_code' => $fresh->join_code,
                'class_name' => $fresh->class_name,
                'play_mode' => $playMode,
                'lesson_title' => $fresh->lesson?->title,
                'groups_locked' => $fresh->groups_locked,
                'status' => $fresh->status,
                'total_students' => $fresh->participants->count(),
                'groups' => $playMode === 'group'
                    ? $fresh->groups->map(function ($g) {
                        $leader = $g->participants->first();

                        return [
                            'id' => $g->id,
                            'group_number' => $g->group_number,
                            'group_name' => $g->group_name,
                            'member_names' => $g->member_names,
                            'leader_name' => $leader?->user?->name,
                            'leader_user_id' => $leader?->user?->id,
                            'current_map_number' => $leader?->user?->current_map_number ?? 1,
                            'activity_status' => $leader?->user?->activity_status ?? 'idle',
                            'joined_at' => $leader?->joined_at?->diffForHumans(),
                        ];
                    })->values()
                    : [],
                'participants' => $fresh->participants
                    ->sortBy('joined_at')
                    ->map(fn ($p) => [
                        'participant_id' => $p->id,
                        'user_id' => $p->user->id,
                        'name' => $p->user->name,
                        'current_map_number' => $p->user->current_map_number,
                        'activity_status' => $p->user->activity_status,
                        'joined_at' => $p->joined_at?->diffForHumans(),
                    ])->values(),
            ];
        });
    }

    private function generateUniqueCode(): string
    {
        do {
            $code = 'JQ' . strtoupper(Str::random(4));
        } while (GameSession::where('join_code', $code)->exists());

        return $code;
    }
}
