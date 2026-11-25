<?php

namespace App\Services;

use App\Models\Challenge;
use App\Models\Lesson;
use App\Models\Map;
use App\Models\SessionParticipant;
use App\Models\StudentProgress;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ScoringService
{
    public function __construct(
        private readonly ChallengeEvaluationService $evaluator
    ) {}

    /**
     * Cache static lesson + maps + challenges (without correct_answer) for 50-100+ student concurrency.
     */
    public function getCachedLessonWorld(int $lessonId): ?Lesson
    {
        return Cache::remember("juanquest:lesson:{$lessonId}:world", now()->addMinutes(10), function () use ($lessonId) {
            return Lesson::with(['maps.challenges'])->find($lessonId);
        });
    }

    public function forgetLessonWorldCache(int $lessonId): void
    {
        Cache::forget("juanquest:lesson:{$lessonId}:world");
    }

    public function startAttempt(User $student, Map $map, ?int $chosenTimeLimit = null): StudentProgress
    {
        $this->assertSessionActiveForStudent($student);

        if ($map->map_number > $student->current_map_number) {
            throw ValidationException::withMessages([
                'map' => "Kailangan munang tapusin ang Mapa {$student->current_map_number} bago buksan ang Mapa {$map->map_number}.",
            ]);
        }

        $existing = StudentProgress::where('user_id', $student->id)
            ->where('map_id', $map->id)
            ->first();

        if ($existing && $existing->is_completed) {
            throw ValidationException::withMessages([
                'map' => 'Nakumpleto na ang mapang ito at hindi na maaaring ulitin.',
            ]);
        }

        // Teacher exclusively controls each map's timer.
        $timeLimit = max(15, (int) $map->time_limit_seconds);

        $sessionId = SessionParticipant::where('user_id', $student->id)
            ->latest('joined_at')
            ->value('game_session_id');

        if ($existing && ! $existing->is_completed) {
            $student->update([
                'activity_status' => 'in_game',
                'last_seen_at' => now(),
            ]);
            if ($sessionId) {
                $this->invalidateSessionTelemetry($sessionId);
            }

            return $existing;
        }

        $progress = StudentProgress::create([
            'user_id' => $student->id,
            'map_id' => $map->id,
            'game_session_id' => $sessionId,
            'score' => 0,
            'mistakes_count' => 0,
            'hearts_remaining' => $map->max_hearts,
            'time_limit_used' => $timeLimit,
            'time_taken_seconds' => 0,
            'attempts' => 1,
            'is_completed' => false,
            'answers_log' => [
                'started_at' => now()->toIso8601String(),
                'completed_challenge_ids' => [],
                'failed_challenge_ids' => [],
                'pending_lifeline' => null,
                'earned_points' => 0,
                'events' => [],
            ],
        ]);

        $student->update([
            'activity_status' => 'in_game',
            'last_seen_at' => now(),
        ]);

        if ($sessionId) {
            $this->invalidateSessionTelemetry($sessionId);
        }

        return $progress;
    }

    /**
     * Persist elapsed time during active gameplay so reloading or reopening the browser
     * resumes cleanly from the student's exact remaining seconds without resetting the clock.
     */
    public function syncElapsedTime(User $student, Map $map, int $elapsedSeconds): ?StudentProgress
    {
        $progress = StudentProgress::where('user_id', $student->id)
            ->where('map_id', $map->id)
            ->first();

        if (! $progress || $progress->is_completed) {
            return $progress;
        }

        $isWholeTimer = ! $this->isPerQuestionTimedStrategy($map->strategy_type);
        $maxCap = $isWholeTimer
            ? max(0, (int) $progress->time_limit_used - 1)
            : max(3600, (int) $progress->time_limit_used * 15);

        $clamped = max(
            (int) $progress->time_taken_seconds,
            min($maxCap, max(0, $elapsedSeconds))
        );

        if ($clamped !== (int) $progress->time_taken_seconds) {
            $progress->time_taken_seconds = $clamped;
            $progress->save();
        }

        return $progress;
    }

    /**
     * @param  array<string, mixed>  $submission
     * @return array<string, mixed>
     */
    public function submitAnswer(
        User $student,
        Map $map,
        Challenge $challenge,
        array $submission,
        int $elapsedSeconds = 0
    ): array {
        $this->assertSessionActiveForStudent($student);

        if ((int) $challenge->map_id !== (int) $map->id) {
            abort(404);
        }

        $cachedLesson = $this->getCachedLessonWorld($map->lesson_id);
        $cachedMap = $cachedLesson?->maps?->firstWhere('id', $map->id);
        $totalChallenges = $cachedMap ? $cachedMap->challenges->count() : $map->challenges()->count();

        return DB::transaction(function () use ($student, $map, $challenge, $submission, $elapsedSeconds, $totalChallenges) {
            $progress = StudentProgress::where('user_id', $student->id)
                ->where('map_id', $map->id)
                ->lockForUpdate()
                ->first();

            if (! $progress) {
                $progress = $this->startAttempt($student, $map);
            }

            if ($progress->is_completed) {
                throw ValidationException::withMessages([
                    'map' => 'Nakumpleto na ang mapang ito at naitala na ang iyong puntos.',
                ]);
            }

            $log = $progress->answers_log ?? [
                'started_at' => now()->toIso8601String(),
                'completed_challenge_ids' => [],
                'failed_challenge_ids' => [],
                'pending_lifeline' => null,
                'earned_points' => 0,
                'events' => [],
            ];
            $completedIds = $log['completed_challenge_ids'] ?? [];
            $failedIds = $log['failed_challenge_ids'] ?? [];
            $prevEarned = (int) ($log['earned_points'] ?? 0);

            if (! empty($log['pending_lifeline'])) {
                throw ValidationException::withMessages([
                    'lifeline' => 'Pumili muna kung gagamit ka ng puso upang sumagot muli o tutuloy sa susunod.',
                ]);
            }

            if (in_array($challenge->id, $completedIds, true) || in_array($challenge->id, $failedIds, true)) {
                return $this->buildPayload($student, $map, $progress, in_array($challenge->id, $completedIds, true), $map->feedback_correct, false);
            }

            $check = $this->evaluator->evaluate($map->strategy_type, $challenge, $submission);
            $isCorrect = (bool) $check['is_correct'];

            $log['events'][] = [
                'challenge_id' => $challenge->id,
                'is_correct' => $isCorrect,
                'at' => now()->toIso8601String(),
            ];

            $isBoardStrategy = in_array($map->strategy_type, ['sequence', 'matching'], true);
            $isWholeTimer = ! $this->isPerQuestionTimedStrategy($map->strategy_type);
            $maxTrackableSeconds = $isWholeTimer
                ? (int) $progress->time_limit_used
                : max((int) $progress->time_limit_used * max(1, $totalChallenges), 3600);
            $progress->time_taken_seconds = max(
                $progress->time_taken_seconds,
                min($maxTrackableSeconds, max(0, $elapsedSeconds))
            );

            // CASE 1: CORRECT ANSWER -> earn points, advance (or finish map if all challenges resolved)
            if ($isCorrect) {
                $completedIds[] = $challenge->id;
                $log['completed_challenge_ids'] = array_values(array_unique($completedIds));
                $log['failed_challenge_ids'] = array_values(array_unique($failedIds));
                $log['pending_lifeline'] = null;

                if ($isBoardStrategy) {
                    $earnedPoints = (int) $map->perfect_score;
                } else {
                    $ptsPerItem = $this->pointsPerChallenge($map, $totalChallenges);
                    $earnedPoints = min(
                        (int) $map->perfect_score,
                        count($log['completed_challenge_ids']) * $ptsPerItem
                    );
                }

                $resolvedCount = count(array_unique(array_merge($log['completed_challenge_ids'], $log['failed_challenge_ids'])));
                $allResolved = $resolvedCount >= max(1, $totalChallenges);
                if ($allResolved && count($log['failed_challenge_ids']) === 0) {
                    $earnedPoints = (int) $map->perfect_score;
                }

                $log['earned_points'] = $earnedPoints;
                $progress->score = $earnedPoints;
                $progress->answers_log = $log;

                if ($allResolved) {
                    $this->finalizeProgress($student, $map, $progress, 'completed');
                } else {
                    $progress->save();
                    if (! $student->last_seen_at || $student->last_seen_at->lt(now()->subSeconds(30))) {
                        $student->update(['last_seen_at' => now()]);
                    }
                }

                return $this->buildPayload(
                    $student,
                    $map,
                    $progress,
                    true,
                    $map->feedback_correct,
                    $allResolved,
                    $check['details'] ?? null,
                    $allResolved ? 'completed' : null
                );
            }

            // CASE 2: WRONG ANSWER -> Check Heart Lifeline ("Taga-Ligtas")
            $boardAttemptEarned = $isBoardStrategy
                ? min((int) $map->perfect_score, max($prevEarned, (int) ($check['earned_points'] ?? 0)))
                : $prevEarned;

            // 2A: Student STILL has hearts -> pause and ask via Heart Lifeline Modal (do NOT deduct heart yet!)
            if ($progress->hearts_remaining > 0) {
                $ptsAtStake = $isBoardStrategy
                    ? max(0, (int) $map->perfect_score - $boardAttemptEarned)
                    : $this->pointsPerChallenge($map, $totalChallenges);

                if ($isBoardStrategy) {
                    $log['earned_points'] = $boardAttemptEarned;
                    $progress->score = $boardAttemptEarned;
                }

                $log['pending_lifeline'] = [
                    'challenge_id' => $challenge->id,
                    'is_board' => $isBoardStrategy,
                    'attempt_earned' => $boardAttemptEarned,
                    'points_at_stake' => $ptsAtStake,
                    'wrong_choice' => $submission['choice'] ?? null,
                ];
                $progress->answers_log = $log;
                $progress->save();

                return $this->buildPayload(
                    $student,
                    $map,
                    $progress,
                    false,
                    $map->feedback_wrong,
                    false,
                    $check['details'] ?? null,
                    null,
                    true
                );
            }

            // 2B: Student has 0 hearts remaining -> Auto 0 pts for this item and immediately advance (or finish map)!
            $progress->mistakes_count = $progress->mistakes_count + 1;
            $log['pending_lifeline'] = null;

            if ($isBoardStrategy) {
                $log['earned_points'] = $boardAttemptEarned;
                $progress->score = $boardAttemptEarned;
                $progress->answers_log = $log;
                $this->finalizeProgress($student, $map, $progress, 'completed');

                return $this->buildPayload(
                    $student,
                    $map,
                    $progress,
                    false,
                    "Wala nang natirang puso. Naitala ang iyong {$progress->score} / {$map->perfect_score} puntos.",
                    true,
                    $check['details'] ?? null,
                    'completed'
                );
            }

            $failedIds[] = $challenge->id;
            $log['completed_challenge_ids'] = array_values(array_unique($completedIds));
            $log['failed_challenge_ids'] = array_values(array_unique($failedIds));

            $ptsPerItem = $this->pointsPerChallenge($map, $totalChallenges);
            $earnedPoints = min(
                (int) $map->perfect_score,
                count($log['completed_challenge_ids']) * $ptsPerItem
            );
            $log['earned_points'] = $earnedPoints;
            $progress->score = $earnedPoints;
            $progress->answers_log = $log;

            $resolvedCount = count(array_unique(array_merge($log['completed_challenge_ids'], $log['failed_challenge_ids'])));
            $allResolved = $resolvedCount >= max(1, $totalChallenges);

            if ($allResolved) {
                $this->finalizeProgress($student, $map, $progress, 'completed');
            } else {
                $progress->save();
                if (! $student->last_seen_at || $student->last_seen_at->lt(now()->subSeconds(30))) {
                    $student->update(['last_seen_at' => now()]);
                }
            }

            return $this->buildPayload(
                $student,
                $map,
                $progress,
                false,
                $allResolved
                    ? "Natapos na ang mapa. Naitala ang iyong {$progress->score} / {$map->perfect_score} puntos."
                    : 'Maling sagot (0 pts). Wala nang natirang puso — diretso sa susunod na tanong.',
                $allResolved,
                $check['details'] ?? null,
                $allResolved ? 'completed' : null
            );
        });
    }

    /**
     * Resolve a pending Heart Lifeline choice after a wrong answer:
     * - 'use_heart': deduct 1 heart and allow retrying the same question/board to save its points.
     * - 'skip': keep remaining hearts, record 0 pts for that question (or finalize board score), and advance.
     *
     * @return array<string, mixed>
     */
    public function resolveLifeline(User $student, Map $map, string $action): array
    {
        $this->assertSessionActiveForStudent($student);

        $cachedLesson = $this->getCachedLessonWorld($map->lesson_id);
        $cachedMap = $cachedLesson?->maps?->firstWhere('id', $map->id);
        $totalChallenges = $cachedMap ? $cachedMap->challenges->count() : $map->challenges()->count();

        return DB::transaction(function () use ($student, $map, $action, $totalChallenges) {
            $progress = StudentProgress::where('user_id', $student->id)
                ->where('map_id', $map->id)
                ->lockForUpdate()
                ->first();

            if (! $progress || $progress->is_completed) {
                throw ValidationException::withMessages([
                    'lifeline' => 'Tapos na ang mapang ito.',
                ]);
            }

            $log = $progress->answers_log ?? [];
            $pending = $log['pending_lifeline'] ?? null;

            if (! is_array($pending) || empty($pending['challenge_id'])) {
                throw ValidationException::withMessages([
                    'lifeline' => 'Walang nakabiting desisyon sa paggamit ng puso.',
                ]);
            }

            $completedIds = $log['completed_challenge_ids'] ?? [];
            $failedIds = $log['failed_challenge_ids'] ?? [];
            $isBoard = (bool) ($pending['is_board'] ?? false);

            if ($action === 'use_heart') {
                if ($progress->hearts_remaining <= 0) {
                    throw ValidationException::withMessages([
                        'lifeline' => 'Wala ka nang natirang puso.',
                    ]);
                }

                $progress->hearts_remaining = max(0, $progress->hearts_remaining - 1);
                $progress->mistakes_count = $progress->mistakes_count + 1;
                if ($isBoard) {
                    $preserved = min(
                        (int) $map->perfect_score,
                        max((int) ($log['earned_points'] ?? 0), (int) ($pending['attempt_earned'] ?? 0))
                    );
                    $log['earned_points'] = $preserved;
                    $progress->score = $preserved;
                }
                $log['pending_lifeline'] = null;
                $log['events'][] = [
                    'challenge_id' => $pending['challenge_id'],
                    'lifeline' => 'use_heart',
                    'hearts_after' => $progress->hearts_remaining,
                    'at' => now()->toIso8601String(),
                ];
                $progress->answers_log = $log;
                $progress->save();

                return array_merge(
                    $this->buildPayload(
                        $student,
                        $map,
                        $progress,
                        false,
                        "Gumamit ka ng 1 puso ({$progress->hearts_remaining} natira). Pumili muli ng tamang sagot!",
                        false
                    ),
                    ['lifeline_action' => 'use_heart']
                );
            }

            // action === 'skip' -> save remaining hearts, record 0 pts on this Q (or accept board earned), and advance!
            $log['pending_lifeline'] = null;
            $log['events'][] = [
                'challenge_id' => $pending['challenge_id'],
                'lifeline' => 'skip',
                'hearts_after' => $progress->hearts_remaining,
                'at' => now()->toIso8601String(),
            ];

            if ($isBoard) {
                $earned = (int) ($pending['attempt_earned'] ?? $log['earned_points'] ?? 0);
                $log['earned_points'] = $earned;
                $progress->score = $earned;
                $progress->answers_log = $log;
                $this->finalizeProgress($student, $map, $progress, 'completed');

                return array_merge(
                    $this->buildPayload(
                        $student,
                        $map,
                        $progress,
                        false,
                        "Itinala ang iyong {$progress->score} / {$map->perfect_score} puntos at naitabi ang natirang puso.",
                        true,
                        null,
                        'completed'
                    ),
                    ['lifeline_action' => 'skip']
                );
            }

            $failedIds[] = (int) $pending['challenge_id'];
            $log['completed_challenge_ids'] = array_values(array_unique($completedIds));
            $log['failed_challenge_ids'] = array_values(array_unique($failedIds));

            $ptsPerItem = $this->pointsPerChallenge($map, $totalChallenges);
            $earnedPoints = min(
                (int) $map->perfect_score,
                count($log['completed_challenge_ids']) * $ptsPerItem
            );
            $log['earned_points'] = $earnedPoints;
            $progress->score = $earnedPoints;
            $progress->answers_log = $log;

            $resolvedCount = count(array_unique(array_merge($log['completed_challenge_ids'], $log['failed_challenge_ids'])));
            $allResolved = $resolvedCount >= max(1, $totalChallenges);

            if ($allResolved) {
                $this->finalizeProgress($student, $map, $progress, 'completed');
            } else {
                $progress->save();
            }

            return array_merge(
                $this->buildPayload(
                    $student,
                    $map,
                    $progress,
                    false,
                    $allResolved
                        ? "Natapos na ang mapa. Naitala ang iyong {$progress->score} / {$map->perfect_score} puntos."
                        : '0 pts sa tanong na ito — naitabi ang iyong puso. Tumuloy sa susunod na tanong.',
                    $allResolved,
                    null,
                    $allResolved ? 'completed' : null
                ),
                ['lifeline_action' => 'skip']
            );
        });
    }

    /**
     * @param  array<string, mixed>|null  $submission
     * @return array<string, mixed>
     */
    public function handleTimeout(User $student, Map $map, ?array $submission = null, ?int $challengeId = null): array
    {
        $this->assertSessionActiveForStudent($student);

        $cachedLesson = $this->getCachedLessonWorld($map->lesson_id);
        $cachedMap = $cachedLesson?->maps?->firstWhere('id', $map->id);
        $orderedChallenges = $cachedMap
            ? $cachedMap->challenges->sortBy('order_index')->values()
            : $map->challenges()->orderBy('order_index')->get();
        $totalChallenges = $orderedChallenges->count();

        return DB::transaction(function () use ($student, $map, $submission, $challengeId, $orderedChallenges, $totalChallenges) {
            $progress = StudentProgress::where('user_id', $student->id)
                ->where('map_id', $map->id)
                ->lockForUpdate()
                ->first();

            if (! $progress) {
                $progress = $this->startAttempt($student, $map);
            }

            if ($progress->is_completed) {
                return $this->buildPayload($student, $map, $progress, false, 'Nakumpleto na ang mapang ito.', true, null, 'already_completed');
            }

            $log = $progress->answers_log ?? [
                'started_at' => now()->toIso8601String(),
                'completed_challenge_ids' => [],
                'failed_challenge_ids' => [],
                'pending_lifeline' => null,
                'earned_points' => 0,
                'events' => [],
            ];

            // BRANCH A: Per-Question Timed Maps (Mapa 1 Multiple Choice & Mapa 5 Decision Quest)
            // Timeout affects ONLY the active question (offers 1 Heart for fresh time; otherwise 0 pts & move on; NO 2-pt floor!)
            if ($this->isPerQuestionTimedStrategy($map->strategy_type)) {
                $completedIds = $log['completed_challenge_ids'] ?? [];
                $failedIds = $log['failed_challenge_ids'] ?? [];
                $resolvedIds = array_values(array_unique(array_merge($completedIds, $failedIds)));

                if (! empty($log['pending_lifeline'])) {
                    return $this->buildPayload(
                        $student,
                        $map,
                        $progress,
                        false,
                        'Naubos na ang oras sa tanong na ito.',
                        false,
                        null,
                        null,
                        true
                    );
                }

                $activeChallenge = null;
                if ($challengeId !== null) {
                    $candidate = $orderedChallenges->firstWhere('id', $challengeId);
                    if ($candidate && ! in_array($candidate->id, $resolvedIds, true)) {
                        $activeChallenge = $candidate;
                    }
                }
                if (! $activeChallenge) {
                    $activeChallenge = $orderedChallenges->first(
                        fn ($c) => ! in_array($c->id, $resolvedIds, true)
                    );
                }

                $ptsPerItem = $this->pointsPerChallenge($map, max(1, $totalChallenges));
                $earnedPoints = min((int) $map->perfect_score, count($completedIds) * $ptsPerItem);
                $log['earned_points'] = $earnedPoints;
                $progress->score = $earnedPoints;
                $progress->time_taken_seconds = max($progress->time_taken_seconds, 1);

                if (! $activeChallenge) {
                    $progress->answers_log = $log;
                    $this->finalizeProgress($student, $map, $progress, 'completed');

                    return $this->buildPayload(
                        $student,
                        $map,
                        $progress,
                        false,
                        "Natapos na ang mapa. Naitala ang iyong {$progress->score} / {$map->perfect_score} puntos.",
                        true,
                        null,
                        'completed'
                    );
                }

                // Per-question timeout: Hearts are strictly for wrong answers ONLY -> immediate 0 pts & move to next question!
                $progress->mistakes_count = $progress->mistakes_count + 1;
                $failedIds[] = $activeChallenge->id;
                $log['completed_challenge_ids'] = array_values(array_unique($completedIds));
                $log['failed_challenge_ids'] = array_values(array_unique($failedIds));
                $log['pending_lifeline'] = null;
                $log['events'][] = [
                    'challenge_id' => $activeChallenge->id,
                    'is_correct' => false,
                    'reason' => 'timeout',
                    'at' => now()->toIso8601String(),
                ];

                $nextResolvedCount = count(array_unique(array_merge($log['completed_challenge_ids'], $log['failed_challenge_ids'])));
                $allResolved = $nextResolvedCount >= max(1, $totalChallenges);
                $progress->answers_log = $log;

                if ($allResolved) {
                    $this->finalizeProgress($student, $map, $progress, 'completed');

                    return $this->buildPayload(
                        $student,
                        $map,
                        $progress,
                        false,
                        "Natapos na ang mapa. Naitala ang iyong {$progress->score} / {$map->perfect_score} puntos.",
                        true,
                        null,
                        'completed'
                    );
                }

                $progress->save();

                return array_merge(
                    $this->buildPayload(
                        $student,
                        $map,
                        $progress,
                        false,
                        'Naubos ang oras sa tanong na ito (0 pts). Diretso sa susunod na tanong.',
                        false
                    ),
                    ['question_timed_out' => true]
                );
            }

            // BRANCH B: Whole-Map Puzzle Maps (Mapa 2 Sequence, Mapa 3 Matching, Mapa 4 Four Pics)
            $isBoardStrategy = in_array($map->strategy_type, ['sequence', 'matching'], true);
            $prevEarned = max(
                (int) ($log['earned_points'] ?? 0),
                (int) ($progress->score ?? 0),
                (int) ($log['pending_lifeline']['attempt_earned'] ?? 0)
            );

            // Evaluate any unsubmitted partial board progress (Mapa 2 sequence / Mapa 3 matching) server-side
            if ($isBoardStrategy && is_array($submission) && ! empty($submission)) {
                $boardChallenge = $orderedChallenges->first();
                if ($boardChallenge) {
                    $partialCheck = $this->evaluator->evaluate($map->strategy_type, $boardChallenge, $submission);
                    $prevEarned = min(
                        (int) $map->perfect_score,
                        max($prevEarned, (int) ($partialCheck['earned_points'] ?? 0))
                    );
                }
            }

            $log['earned_points'] = min((int) $map->perfect_score, max(0, $prevEarned));
            $progress->score = $log['earned_points'];
            $progress->answers_log = $log;
            $progress->time_taken_seconds = max($progress->time_taken_seconds, $progress->time_limit_used);
            $progress->hearts_remaining = 0;
            $this->finalizeProgress($student, $map, $progress, 'timeout');

            $finalScore = (int) $progress->score;
            $minFloor = $this->effectiveMinFloor($map);
            $feedback = $log['earned_points'] > $minFloor
                ? "Naubos na ang oras. Naitala ang iyong {$finalScore} / {$map->perfect_score} puntos mula sa mga tamang sagot upang makapagpatuloy."
                : "Naubos na ang oras. Naitala ang iyong {$finalScore} puntos (minimum {$minFloor} pts) upang makapagpatuloy.";

            return $this->buildPayload(
                $student,
                $map,
                $progress,
                false,
                $feedback,
                true,
                null,
                'timeout'
            );
        });
    }

    /**
     * Current live earned points for an active attempt (0..perfect_score).
     */
    public function getCurrentEarnedPoints(StudentProgress $progress, Map $map): int
    {
        if ($progress->is_completed) {
            return (int) $progress->score;
        }

        $logged = (int) ($progress->answers_log['earned_points'] ?? $progress->score ?? 0);

        return min((int) $map->perfect_score, max(0, $logged));
    }

    public function pointsPerChallenge(Map $map, int $totalChallenges): int
    {
        if ($map->strategy_type === 'multiple_choice' && $totalChallenges >= 8) {
            return 1;
        }

        return max(1, (int) round(((int) $map->perfect_score) / max(1, $totalChallenges)));
    }

    public function invalidateSessionTelemetry(?int $sessionId): void
    {
        if (! $sessionId) {
            return;
        }
        Cache::forget("juanquest:session:{$sessionId}:monitor");
        Cache::forget("juanquest:session:{$sessionId}:leaderboard");
        Cache::forget("juanquest:session:{$sessionId}:lobby");
        GroupingService::bumpSessionVersion($sessionId);
    }

    private function assertSessionActiveForStudent(User $student): void
    {
        $session = SessionParticipant::with('gameSession')
            ->where('user_id', $student->id)
            ->latest('joined_at')
            ->first()?->gameSession;

        if (! $session) {
            return;
        }

        if ($session->status === 'waiting') {
            throw ValidationException::withMessages([
                'session' => 'Hindi pa nagsisimula ang laro. Antabayanan muna ang go-signal ng iyong guro.',
            ]);
        }

        if ($session->status === 'finished') {
            throw ValidationException::withMessages([
                'session' => 'Tapos na ang sesyon ng klase at hindi na maaaring maglaro.',
            ]);
        }
    }

    private function isPerQuestionTimedStrategy(string $strategyType): bool
    {
        return in_array($strategyType, ['multiple_choice', 'decision_quest'], true);
    }

    private function effectiveMinFloor(Map $map): int
    {
        return $this->isPerQuestionTimedStrategy($map->strategy_type)
            ? 0
            : max(2, (int) $map->min_floor_score);
    }

    private function finalizeProgress(User $student, Map $map, StudentProgress $progress, string $reason): void
    {
        $earned = (int) ($progress->answers_log['earned_points'] ?? $progress->score ?? 0);
        $minFloor = $this->effectiveMinFloor($map);
        $finalScore = min((int) $map->perfect_score, max($minFloor, $earned));

        $log = $progress->answers_log ?? [];
        $log['finish_reason'] = $reason;
        $log['earned_points'] = $earned;
        $log['pending_lifeline'] = null;

        $progress->score = $finalScore;
        $progress->is_completed = true;
        $progress->completed_at = now();
        $progress->answers_log = $log;
        $progress->save();

        $cachedLesson = $this->getCachedLessonWorld($map->lesson_id);
        $totalMaps = $cachedLesson?->maps?->count() ?: 5;
        $nextMapNumber = min($totalMaps, max($student->current_map_number, $map->map_number + 1));
        $allCompleted = $map->map_number >= $totalMaps;

        $student->update([
            'current_map_number' => $nextMapNumber,
            'activity_status' => $allCompleted ? 'completed' : 'exploring_world',
            'last_seen_at' => now(),
        ]);

        $this->invalidateSessionTelemetry($progress->game_session_id);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPayload(
        User $student,
        Map $map,
        StudentProgress $progress,
        bool $isCorrect,
        string $feedback,
        bool $levelEnded,
        ?array $details = null,
        ?string $finishReason = null,
        bool $awaitingLifeline = false
    ): array {
        $liveEarned = $this->getCurrentEarnedPoints($progress, $map);
        $completedIds = $progress->answers_log['completed_challenge_ids'] ?? [];
        $failedIds = $progress->answers_log['failed_challenge_ids'] ?? [];
        $resolvedIds = array_values(array_unique(array_merge($completedIds, $failedIds)));

        return [
            'is_correct' => $isCorrect,
            'feedback' => $feedback,
            'hearts_remaining' => $progress->hearts_remaining,
            'mistakes_count' => $progress->mistakes_count,
            'earned_points' => $liveEarned,
            'projected_score' => $liveEarned,
            'max_score' => (int) $map->perfect_score,
            'level_ended' => $levelEnded,
            'finish_reason' => $finishReason,
            'final_score' => $progress->is_completed ? (int) $progress->score : null,
            'completed_challenge_ids' => $completedIds,
            'failed_challenge_ids' => $failedIds,
            'resolved_challenge_ids' => $resolvedIds,
            'awaiting_lifeline' => $awaitingLifeline,
            'pending_lifeline' => $progress->is_completed ? null : ($progress->answers_log['pending_lifeline'] ?? null),
            'current_map_number' => $student->current_map_number,
            'activity_status' => $student->activity_status,
            'details' => $details,
        ];
    }
}
