<?php

namespace App\Services;

use App\Models\GameSession;
use App\Models\SessionGroup;
use App\Models\SessionParticipant;
use App\Models\StudentProgress;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OfflineQrService
{
    public function __construct(
        private readonly GroupingService $grouping
    ) {}

    /**
     * Deterministic 12-char session key embedded inside the Teacher's Offline Join QR
     * so offline student devices can sign their Result QR without needing internet.
     */
    public function sessionQrKey(GameSession $session): string
    {
        $raw = "jq-qr-key|{$session->id}|".strtoupper(trim($session->join_code));

        return substr(hash_hmac('sha256', $raw, (string) config('app.key')), 0, 12);
    }

    /**
     * 6-char deterministic offline unblock code visible ONLY to the teacher.
     * Offline student devices verify this locally without internet if the teacher allows a retry.
     */
    public function teacherUnblockCode(GameSession $session): string
    {
        $code = strtoupper(trim((string) $session->join_code));
        $key = $this->sessionQrKey($session);

        return strtoupper(substr(hash('sha256', "jq-unblock|{$code}|{$key}"), 0, 6));
    }

    /**
     * Compact JSON payload encoded into the Teacher's Offline Join QR code.
     *
     * @return array<string, string>
     */
    public function buildJoinQrPayload(GameSession $session): array
    {
        return [
            't' => 'jqj1',
            'c' => strtoupper(trim($session->join_code)),
            'n' => (string) $session->class_name,
            'm' => ($session->play_mode ?? 'group') === 'individual' ? 'individual' : 'group',
            'k' => $this->sessionQrKey($session),
        ];
    }

    /**
     * Canonical pipe-delimited string signed by the offline client & re-verified server-side.
     *
     * @param  array<string, mixed>  $data
     */
    public function buildResultCanonicalString(array $data): string
    {
        $code = strtoupper(trim((string) ($data['c'] ?? '')));
        $mode = ($data['m'] ?? 'group') === 'individual' ? 'individual' : 'group';
        $group = trim((string) ($data['g'] ?? ''));
        $leader = trim((string) ($data['l'] ?? ''));
        $scores = implode(',', array_map('intval', (array) ($data['s'] ?? [])));
        $hearts = implode(',', array_map('intval', (array) ($data['h'] ?? [])));
        $times = implode(',', array_map('intval', (array) ($data['tm'] ?? [])));
        $subId = trim((string) ($data['id'] ?? ''));
        $att = max(1, (int) ($data['att'] ?? 1));

        $base = "{$code}|{$mode}|{$group}|{$leader}|{$scores}|{$hearts}|{$times}|{$subId}";

        return $att > 1 ? "{$base}|att={$att}" : $base;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function expectedResultSignature(GameSession $session, array $data): string
    {
        return substr(
            hash('sha256', $this->buildResultCanonicalString($data).'|'.$this->sessionQrKey($session)),
            0,
            16
        );
    }

    /**
     * Validate a scanned Offline Result QR payload and import it into TiDB Cloud
     * alongside online participants inside the exact same classroom session.
     *
     * @param  array<string, mixed>  $data
     * @return array{already_imported: bool, verified_qr: bool, entry_name: string, total_score: int, max_total_score: int, hearts_remaining: int, max_total_hearts: int}
     */
    public function importResult(GameSession $session, array $data, bool $allowManual = false): array
    {
        if (($data['t'] ?? '') !== 'jqr1') {
            throw ValidationException::withMessages([
                'qr' => 'Hindi valid na JuanQuest Result QR ang na-scan.',
            ]);
        }

        $qrCode = strtoupper(trim((string) ($data['c'] ?? '')));
        if ($qrCode !== strtoupper(trim($session->join_code))) {
            throw ValidationException::withMessages([
                'qr' => "Para sa sesyon na \"{$qrCode}\" ang QR na ito, hindi sa \"{$session->join_code}\".",
            ]);
        }

        $sig = strtolower(trim((string) ($data['sig'] ?? '')));
        $isManual = $sig === 'manual';

        if ($isManual) {
            if (! $allowManual) {
                throw ValidationException::withMessages([
                    'qr' => 'Manual offline result ito (hindi na-scan ang Teacher Join QR). Kumpirmahin kung nais itong tanggapin.',
                ]);
            }
        } else {
            $expected = $this->expectedResultSignature($session, $data);
            if ($sig === '' || ! hash_equals($expected, $sig)) {
                throw ValidationException::withMessages([
                    'qr' => 'Hindi tugma ang security signature ng Result QR (maaaring nabago o maling sesyon).',
                ]);
            }
        }

        $session->loadMissing('lesson.maps');
        $maps = ($session->lesson?->maps ?? collect())->sortBy('map_number')->values();
        if ($maps->isEmpty()) {
            throw ValidationException::withMessages([
                'qr' => 'Walang aktibong mapa sa aralin ng sesyon na ito.',
            ]);
        }

        $scores = array_values(array_map('intval', (array) ($data['s'] ?? [])));
        $hearts = array_values(array_map('intval', (array) ($data['h'] ?? [])));
        $times = array_values(array_map('intval', (array) ($data['tm'] ?? [])));
        $reasons = array_values((array) ($data['fr'] ?? []));

        if (count($scores) !== $maps->count() || count($hearts) !== $maps->count()) {
            throw ValidationException::withMessages([
                'qr' => 'Hindi kumpleto ang datos ng 5 mapa sa Result QR.',
            ]);
        }

        $maxTotalScore = (int) $maps->sum('perfect_score');
        $maxTotalHearts = (int) $maps->sum('max_hearts');
        $totalScore = 0;
        $totalHearts = 0;

        foreach ($maps as $idx => $map) {
            $s = $scores[$idx];
            $h = $hearts[$idx];
            $t = max(0, min(7200, (int) ($times[$idx] ?? 0)));
            if ($s < 0 || $s > (int) $map->perfect_score) {
                throw ValidationException::withMessages([
                    'qr' => "Invalid ang puntos ({$s}) para sa Mapa {$map->map_number}.",
                ]);
            }
            if ($h < 0 || $h > (int) $map->max_hearts) {
                throw ValidationException::withMessages([
                    'qr' => "Invalid ang natirang puso ({$h}) para sa Mapa {$map->map_number}.",
                ]);
            }
            $times[$idx] = $t;
            $totalScore += $s;
            $totalHearts += $h;
        }

        $playMode = ($session->play_mode ?? 'group') === 'individual' ? 'individual' : 'group';
        $leaderName = (string) preg_replace('/\s+/', ' ', trim((string) ($data['l'] ?? '')));
        $groupName = (string) preg_replace('/\s+/', ' ', trim((string) ($data['g'] ?? '')));
        $memberNames = trim((string) ($data['mb'] ?? ''));
        $submissionId = trim((string) ($data['id'] ?? ''));
        $attempt = max(1, min(20, (int) ($data['att'] ?? 1)));

        $effectiveUserName = $leaderName !== '' ? $leaderName : ($playMode === 'group' ? $groupName : '');
        if (mb_strlen($effectiveUserName) < 2) {
            throw ValidationException::withMessages([
                'qr' => 'Kulang ang pangalan ng pangkat o mag-aaral sa Result QR.',
            ]);
        }

        $entryName = $playMode === 'group' && $groupName !== '' ? $groupName : $effectiveUserName;

        $alreadyImported = DB::transaction(function () use (
            $session,
            $maps,
            $scores,
            $hearts,
            $times,
            $reasons,
            $playMode,
            $effectiveUserName,
            $groupName,
            $memberNames,
            $submissionId,
            $attempt,
            $isManual
        ) {
            $lockedSession = GameSession::where('id', $session->id)->lockForUpdate()->firstOrFail();

            // Deduplicate cleanly if teacher accidentally scans the same Result QR twice
            if ($submissionId !== '') {
                $existingById = StudentProgress::where('game_session_id', $lockedSession->id)
                    ->where('answers_log->offline_submission_id', $submissionId)
                    ->exists();
                if ($existingById) {
                    return true;
                }
            }

            $existingParticipant = null;
            if ($playMode === 'group' && $groupName !== '') {
                $existingParticipant = SessionParticipant::with(['user', 'sessionGroup'])
                    ->where('game_session_id', $lockedSession->id)
                    ->whereHas('sessionGroup', function ($q) use ($groupName) {
                        $q->whereRaw('LOWER(group_name) = ?', [mb_strtolower($groupName)]);
                    })
                    ->first();
            }

            if (! $existingParticipant) {
                $existingParticipant = SessionParticipant::with(['user', 'sessionGroup'])
                    ->where('game_session_id', $lockedSession->id)
                    ->whereHas('user', function ($q) use ($effectiveUserName) {
                        $q->where('role', 'student')
                            ->whereRaw('LOWER(name) = ?', [mb_strtolower($effectiveUserName)]);
                    })
                    ->first();
            }

            if ($existingParticipant && $existingParticipant->user) {
                $existingCompletedCount = StudentProgress::where('user_id', $existingParticipant->user->id)
                    ->where('is_completed', true)
                    ->count();
                if ($existingCompletedCount >= $maps->count() && $attempt <= 1) {
                    return true;
                }

                // Merge cleanly into existing participant when:
                // (a) Online participant lost signal mid-game (< 5 maps completed online) and finished via Offline QR, OR
                // (b) Teacher-unblocked retry (att > 1). Prevents duplicate rows!
                $student = $existingParticipant->user;
                $isFailoverMerge = $existingCompletedCount < $maps->count();

                $student->update([
                    'current_map_number' => (int) ($maps->max('map_number') ?: 5),
                    'activity_status' => 'completed',
                    'last_seen_at' => now(),
                ]);
                if ($playMode === 'group' && $existingParticipant->sessionGroup) {
                    $existingParticipant->sessionGroup->update([
                        'group_name' => mb_strlen($groupName) >= 2 ? mb_substr($groupName, 0, 40) : $existingParticipant->sessionGroup->group_name,
                        'member_names' => $memberNames !== '' ? mb_substr($memberNames, 0, 500) : $existingParticipant->sessionGroup->member_names,
                    ]);
                }
                $existingProgressByMapId = StudentProgress::where('user_id', $student->id)
                    ->get()
                    ->keyBy('map_id');

                foreach ($maps as $idx => $map) {
                    // During an online->offline failover merge (attempt 1), NEVER overwrite already-completed server-graded maps!
                    if ($isFailoverMerge && $attempt <= 1) {
                        $existingMapProgress = $existingProgressByMapId->get($map->id);
                        if ($existingMapProgress && $existingMapProgress->is_completed) {
                            continue;
                        }
                    }

                    $frCode = (string) ($reasons[$idx] ?? 'c');
                    $finishReason = $frCode === 't' ? 'timeout' : 'completed';
                    StudentProgress::updateOrCreate(
                        ['user_id' => $student->id, 'map_id' => $map->id],
                        [
                            'game_session_id' => $lockedSession->id,
                            'score' => $scores[$idx],
                            'mistakes_count' => max(0, (int) $map->max_hearts - $hearts[$idx]),
                            'hearts_remaining' => $hearts[$idx],
                            'time_limit_used' => (int) $map->time_limit_seconds,
                            'time_taken_seconds' => $times[$idx],
                            'attempts' => $attempt,
                            'is_completed' => true,
                            'completed_at' => now(),
                            'answers_log' => [
                                'source' => 'offline_qr',
                                'failover_from_online' => $isFailoverMerge,
                                'offline_verified' => ! $isManual,
                                'offline_submission_id' => $submissionId !== '' ? $submissionId : null,
                                'offline_attempt' => $attempt,
                                'finish_reason' => $finishReason,
                                'earned_points' => $scores[$idx],
                            ],
                        ]
                    );
                }

                return false;
            }

            $student = User::create([
                'name' => mb_substr($effectiveUserName, 0, 80),
                'email' => null,
                'password' => null,
                'role' => 'student',
                'section' => $lockedSession->class_name,
                'selected_character' => 'juan',
                'current_map_number' => (int) ($maps->max('map_number') ?: 5),
                'activity_status' => 'completed',
                'last_seen_at' => now(),
            ]);

            $groupId = null;
            if ($playMode === 'group') {
                $nextNumber = ((int) $lockedSession->groups()->max('group_number')) + 1;
                $resolvedGroupName = mb_strlen($groupName) >= 2 ? mb_substr($groupName, 0, 40) : "Pangkat {$nextNumber}";
                $group = SessionGroup::create([
                    'game_session_id' => $lockedSession->id,
                    'group_number' => $nextNumber,
                    'group_name' => $resolvedGroupName,
                    'member_names' => $memberNames !== '' ? mb_substr($memberNames, 0, 500) : null,
                ]);
                $groupId = $group->id;
            }

            SessionParticipant::create([
                'game_session_id' => $lockedSession->id,
                'user_id' => $student->id,
                'session_group_id' => $groupId,
                'joined_at' => now(),
            ]);

            foreach ($maps as $idx => $map) {
                $frCode = (string) ($reasons[$idx] ?? 'c');
                $finishReason = $frCode === 't' ? 'timeout' : 'completed';

                StudentProgress::create([
                    'user_id' => $student->id,
                    'map_id' => $map->id,
                    'game_session_id' => $lockedSession->id,
                    'score' => $scores[$idx],
                    'mistakes_count' => max(0, (int) $map->max_hearts - $hearts[$idx]),
                    'hearts_remaining' => $hearts[$idx],
                    'time_limit_used' => (int) $map->time_limit_seconds,
                    'time_taken_seconds' => $times[$idx],
                    'attempts' => $attempt,
                    'is_completed' => true,
                    'completed_at' => now(),
                    'answers_log' => [
                        'source' => 'offline_qr',
                        'offline_verified' => ! $isManual,
                        'offline_submission_id' => $submissionId !== '' ? $submissionId : null,
                        'offline_attempt' => $attempt,
                        'finish_reason' => $finishReason,
                        'earned_points' => $scores[$idx],
                    ],
                ]);
            }

            return false;
        });

        $this->grouping->forgetSessionCaches($session);

        return [
            'already_imported' => $alreadyImported,
            'verified_qr' => ! $isManual,
            'entry_name' => $entryName,
            'total_score' => $totalScore,
            'max_total_score' => $maxTotalScore,
            'hearts_remaining' => $totalHearts,
            'max_total_hearts' => $maxTotalHearts,
        ];
    }
}
