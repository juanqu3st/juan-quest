<?php

namespace App\Services;

use App\Models\Challenge;

class ChallengeEvaluationService
{
    /**
     * Evaluate a student's submission server-side without ever exposing correct_answer.
     *
     * Final Module Scoring (10 pts per map / 50 pts total):
     * - Mapa 1 (multiple_choice): 1 pt per correct question (10 items = 10 pts)
     * - Mapa 2 (sequence): 2 pts per event in correct position (5 events = 10 pts)
     * - Mapa 3 (matching): 2 pts per correct pair (5 pairs = 10 pts)
     * - Mapa 4 (four_pics): 2 pts per correct word (5 puzzles = 10 pts)
     * - Mapa 5 (decision_quest): 2 pts per correct decision (5 scenarios = 10 pts)
     *
     * @param  array<string, mixed>  $submission
     * @return array{is_correct: bool, earned_points?: int, details?: array<string, mixed>}
     */
    public function evaluate(string $strategyType, Challenge $challenge, array $submission): array
    {
        $answerKey = $challenge->correct_answer ?? [];

        return match ($strategyType) {
            'multiple_choice' => $this->evaluateChoice($submission, $answerKey, 1),
            'decision_quest' => $this->evaluateChoice($submission, $answerKey, 2),
            'sequence' => $this->evaluateSequence(
                array_map('intval', (array) ($submission['order'] ?? [])),
                array_map('intval', (array) ($answerKey['order'] ?? []))
            ),
            'matching' => $this->evaluateMatching(
                (array) ($submission['pairs'] ?? []),
                (array) ($answerKey['pairs'] ?? [])
            ),
            'four_pics' => $this->evaluateWord($submission, $answerKey, 2),
            default => ['is_correct' => false, 'earned_points' => 0],
        };
    }

    /**
     * @param  array<string, mixed>  $submission
     * @param  array<string, mixed>  $answerKey
     * @return array{is_correct: bool, earned_points: int}
     */
    private function evaluateChoice(array $submission, array $answerKey, int $pointsPerItem): array
    {
        $ok = strtoupper(trim((string) ($submission['choice'] ?? ''))) === strtoupper((string) ($answerKey['choice'] ?? ''));

        return [
            'is_correct' => $ok,
            'earned_points' => $ok ? $pointsPerItem : 0,
        ];
    }

    /**
     * @param  array<string, mixed>  $submission
     * @param  array<string, mixed>  $answerKey
     * @return array{is_correct: bool, earned_points: int}
     */
    private function evaluateWord(array $submission, array $answerKey, int $pointsPerItem): array
    {
        $ok = $this->normalizeWord((string) ($submission['word'] ?? '')) === $this->normalizeWord((string) ($answerKey['word'] ?? ''));

        return [
            'is_correct' => $ok,
            'earned_points' => $ok ? $pointsPerItem : 0,
        ];
    }

    /**
     * @param  array<int, int>  $submittedOrder
     * @param  array<int, int>  $expectedOrder
     * @return array{is_correct: bool, earned_points: int, details: array<string, mixed>}
     */
    private function evaluateSequence(array $submittedOrder, array $expectedOrder): array
    {
        $total = count($expectedOrder);
        $correctPositions = 0;

        for ($i = 0; $i < $total; $i++) {
            if (isset($submittedOrder[$i]) && $submittedOrder[$i] === $expectedOrder[$i]) {
                $correctPositions++;
            }
        }

        $allMatch = $total > 0 && count($submittedOrder) === $total && $correctPositions === $total;

        return [
            'is_correct' => $allMatch,
            'earned_points' => min(10, $correctPositions * 2),
            'details' => [
                'correct_positions' => $correctPositions,
                'total_positions' => $total,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $submittedPairs
     * @param  array<string, mixed>  $expectedPairs
     * @return array{is_correct: bool, earned_points: int, details: array<string, mixed>}
     */
    private function evaluateMatching(array $submittedPairs, array $expectedPairs): array
    {
        $total = count($expectedPairs);
        $matched = [];
        $correctCount = 0;

        foreach ($expectedPairs as $leftId => $rightId) {
            $key = (string) $leftId;
            $isPairMatch = isset($submittedPairs[$key])
                && strtoupper((string) $submittedPairs[$key]) === strtoupper((string) $rightId);
            $matched[$key] = $isPairMatch;
            if ($isPairMatch) {
                $correctCount++;
            }
        }

        $allMatch = $total > 0 && count($submittedPairs) === $total && $correctCount === $total;

        return [
            'is_correct' => $allMatch,
            'earned_points' => min(10, $correctCount * 2),
            'details' => [
                'pair_status' => $matched,
                'correct_pairs' => $correctCount,
                'total_pairs' => $total,
            ],
        ];
    }

    private function normalizeWord(string $word): string
    {
        return strtoupper((string) preg_replace('/\s+/', '', trim($word)));
    }
}
