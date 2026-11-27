<?php

namespace App\Services;

use App\Models\GameSession;
use App\Models\SessionParticipant;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\StreamedResponse;

class RankingMonitorService
{
    /**
     * Cached 4-second live monitor aggregation supporting both Group Mode (1 device = 1 Pangkat)
     * and Individual Mode (pure solo, no groups).
     *
     * @return array<string, mixed>
     */
    public function getMonitorData(GameSession $session): array
    {
        return Cache::remember("juanquest:session:{$session->id}:monitor", now()->addSeconds(4), function () use ($session) {
            $session->loadMissing('lesson.maps');
            $maps = $session->lesson?->maps?->keyBy('map_number') ?? collect();
            $maxTotalScore = (int) ($maps->sum('perfect_score') ?: 50);
            $maxTotalHearts = (int) ($maps->sum('max_hearts') ?: 15);
            $playMode = $session->play_mode ?? 'group';

            $participants = SessionParticipant::with([
                'user.studentProgress.map',
                'sessionGroup',
            ])->where('game_session_id', $session->id)->get();

            $rows = $participants->map(function ($p) use ($session, $maps, $playMode, $maxTotalHearts) {
                $user = $p->user;
                $progressByNumber = $user->studentProgress->keyBy(fn ($sp) => $sp->map?->map_number);

                $mapScores = [];
                $totalScore = 0;
                $totalTime = 0;
                $completedCount = 0;
                $totalHeartsRemaining = 0;

                for ($m = 1; $m <= 5; $m++) {
                    $sp = $progressByNumber->get($m);
                    if ($sp && $sp->is_completed) {
                        $mapScores[$m] = $sp->score;
                        $totalScore += $sp->score;
                        $totalTime += $sp->time_taken_seconds;
                        $completedCount++;
                        $totalHeartsRemaining += (int) $sp->hearts_remaining;
                    } else {
                        $mapScores[$m] = null;
                        if ($sp && ! $sp->is_completed) {
                            $totalHeartsRemaining += (int) $sp->hearts_remaining;
                        }
                    }
                }

                $isOfflineQr = $user->studentProgress->contains(
                    fn ($sp) => (($sp->answers_log['source'] ?? null) === 'offline_qr')
                );
                $offlineAttempt = (int) ($user->studentProgress->max(
                    fn ($sp) => (int) ($sp->answers_log['offline_attempt'] ?? 1)
                ) ?: 1);

                $isDone = $user->activity_status === 'completed' || $completedCount >= 5;
                $secondsSinceSeen = $user->last_seen_at ? (int) $user->last_seen_at->diffInSeconds(now()) : null;
                $isDisconnected = ! $isOfflineQr
                    && ! $isDone
                    && $session->status === 'active'
                    && ($secondsSinceSeen === null || $secondsSinceSeen >= 45);

                $connectionStatus = $isOfflineQr
                    ? 'offline_qr'
                    : ($isDisconnected ? 'disconnected' : 'online');

                return [
                    'user_id' => $user->id,
                    'name' => $user->name,
                    'source' => $isOfflineQr ? 'offline_qr' : 'online',
                    'connection_status' => $connectionStatus,
                    'last_seen_seconds_ago' => $secondsSinceSeen,
                    'offline_attempt' => $offlineAttempt,
                    'group_id' => $playMode === 'group' ? $p->session_group_id : null,
                    'group_number' => $playMode === 'group' ? $p->sessionGroup?->group_number : null,
                    'group_name' => $playMode === 'group'
                        ? ($p->sessionGroup?->group_name ?? $user->name)
                        : null,
                    'member_names' => $playMode === 'group' ? $p->sessionGroup?->member_names : null,
                    'current_map_number' => $user->current_map_number,
                    'current_map_title' => $maps->get($user->current_map_number)?->title ?? "Mapa {$user->current_map_number}",
                    'activity_status' => $user->activity_status,
                    'map_scores' => $mapScores,
                    'hearts_remaining' => $totalHeartsRemaining,
                    'max_total_hearts' => $maxTotalHearts,
                    'completed_maps' => $completedCount,
                    'total_time_seconds' => $totalTime,
                    'total_score' => $totalScore,
                ];
            })->sortBy([
                ['total_score', 'desc'],
                ['completed_maps', 'desc'],
                ['total_time_seconds', 'asc'],
                ['hearts_remaining', 'desc'],
                ['name', 'asc'],
            ])->values()->map(function ($row, $idx) {
                $row['rank'] = $idx + 1;

                return $row;
            });

            $perGroup = $playMode === 'group'
                ? $rows->map(fn ($row) => [
                    'group_id' => $row['group_id'],
                    'group_number' => $row['group_number'],
                    'group_name' => $row['group_name'],
                    'leader_name' => $row['name'],
                    'leader_user_id' => $row['user_id'],
                    'member_names' => $row['member_names'],
                    'source' => $row['source'],
                    'connection_status' => $row['connection_status'],
                    'last_seen_seconds_ago' => $row['last_seen_seconds_ago'],
                    'offline_attempt' => $row['offline_attempt'],
                    'rank' => $row['rank'],
                    'current_map_number' => $row['current_map_number'],
                    'current_map_title' => $row['current_map_title'],
                    'activity_status' => $row['activity_status'],
                    'map_scores' => $row['map_scores'],
                    'hearts_remaining' => $row['hearts_remaining'],
                    'max_total_hearts' => $row['max_total_hearts'],
                    'completed_maps' => $row['completed_maps'],
                    'total_time_seconds' => $row['total_time_seconds'],
                    'total_score' => $row['total_score'],
                ])->values()
                : collect();

            $offlineQr = app(OfflineQrService::class);

            return [
                'session' => [
                    'id' => $session->id,
                    'join_code' => $session->join_code,
                    'class_name' => $session->class_name,
                    'play_mode' => $playMode,
                    'status' => $session->status,
                    'total_students' => $rows->count(),
                    'total_groups' => $perGroup->count(),
                    'offline_qr_key' => $offlineQr->sessionQrKey($session),
                    'offline_join_qr' => $offlineQr->buildJoinQrPayload($session),
                    'offline_unblock_code' => $offlineQr->teacherUnblockCode($session),
                ],
                'max_total_score' => $maxTotalScore,
                'max_total_hearts' => $maxTotalHearts,
                'per_group' => $perGroup,
                'individual' => $playMode === 'individual' ? $rows : collect(),
                'updated_at' => now()->format('H:i:s'),
            ];
        });
    }

    /**
     * Cached 5-second student leaderboard drawer response adapted to play_mode.
     *
     * @return array<string, mixed>
     */
    public function getStudentLeaderboard(?GameSession $session): array
    {
        if (! $session) {
            return ['play_mode' => 'individual', 'groups' => [], 'individuals' => []];
        }

        return Cache::remember("juanquest:session:{$session->id}:leaderboard", now()->addSeconds(5), function () use ($session) {
            $monitor = $this->getMonitorData($session);
            $playMode = $monitor['session']['play_mode'] ?? 'group';

            if ($playMode === 'group') {
                return [
                    'play_mode' => 'group',
                    'groups' => collect($monitor['per_group'])->map(fn ($g) => [
                        'group_id' => $g['group_id'],
                        'user_id' => $g['leader_user_id'],
                        'group_name' => $g['group_name'],
                        'leader_name' => $g['leader_name'],
                        'member_names' => $g['member_names'],
                        'rank' => $g['rank'],
                        'total_score' => $g['total_score'],
                        'completed_maps' => $g['completed_maps'],
                    ])->values(),
                    'individuals' => [],
                ];
            }

            return [
                'play_mode' => 'individual',
                'groups' => [],
                'individuals' => collect($monitor['individual'])->map(fn ($i) => [
                    'user_id' => $i['user_id'],
                    'name' => $i['name'],
                    'rank' => $i['rank'],
                    'total_score' => $i['total_score'],
                    'completed_maps' => $i['completed_maps'],
                ])->values(),
            ];
        });
    }

    public function exportCsv(GameSession $session): StreamedResponse
    {
        $payload = $this->getMonitorData($session);
        $playMode = $payload['session']['play_mode'] ?? 'group';
        $filename = "juanquest-{$session->join_code}-rankings.csv";

        return response()->streamDownload(function () use ($payload, $playMode) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF");

            $safe = static function (mixed $val): string {
                $str = (string) ($val ?? '');
                if ($str !== '' && $str !== '-' && preg_match('/^[=+\-@\t\r]/', $str) === 1) {
                    return "'{$str}";
                }

                return $str;
            };

            if ($playMode === 'group') {
                fputcsv($handle, [
                    'Rank',
                    'Pangkat',
                    'Mga Miyembro',
                    'Current Map',
                    'Activity Status',
                    'M1 (/10)',
                    'M2 (/10)',
                    'M3 (/10)',
                    'M4 (/10)',
                    'M5 (/10)',
                    'Hearts (/15)',
                    'Total Time (s)',
                    'Total Score (/50)',
                ]);

                foreach ($payload['per_group'] as $row) {
                    $maxHearts = $row['max_total_hearts'] ?? 15;
                    fputcsv($handle, [
                        $row['rank'],
                        $safe($row['group_name']),
                        $safe($row['member_names'] ?? '-'),
                        "Mapa {$row['current_map_number']}",
                        $row['activity_status'],
                        $row['map_scores'][1] ?? '-',
                        $row['map_scores'][2] ?? '-',
                        $row['map_scores'][3] ?? '-',
                        $row['map_scores'][4] ?? '-',
                        $row['map_scores'][5] ?? '-',
                        "{$row['hearts_remaining']}/{$maxHearts}",
                        $row['total_time_seconds'],
                        $row['total_score'],
                    ]);
                }
            } else {
                fputcsv($handle, [
                    'Rank',
                    'Student Name',
                    'Current Map',
                    'Activity Status',
                    'M1 (/10)',
                    'M2 (/10)',
                    'M3 (/10)',
                    'M4 (/10)',
                    'M5 (/10)',
                    'Hearts (/15)',
                    'Total Time (s)',
                    'Total Score (/50)',
                ]);

                foreach ($payload['individual'] as $row) {
                    $maxHearts = $row['max_total_hearts'] ?? 15;
                    fputcsv($handle, [
                        $row['rank'],
                        $safe($row['name']),
                        "Mapa {$row['current_map_number']}",
                        $row['activity_status'],
                        $row['map_scores'][1] ?? '-',
                        $row['map_scores'][2] ?? '-',
                        $row['map_scores'][3] ?? '-',
                        $row['map_scores'][4] ?? '-',
                        $row['map_scores'][5] ?? '-',
                        "{$row['hearts_remaining']}/{$maxHearts}",
                        $row['total_time_seconds'],
                        $row['total_score'],
                    ]);
                }
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
