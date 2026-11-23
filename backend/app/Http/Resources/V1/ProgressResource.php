<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProgressResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $remainingSeconds = max(1, (int) $this->time_limit_used - (int) $this->time_taken_seconds);
        $earnedPoints = $this->is_completed
            ? (int) $this->score
            : (int) ($this->answers_log['earned_points'] ?? $this->score ?? 0);

        $completedIds = $this->answers_log['completed_challenge_ids'] ?? [];
        $failedIds = $this->answers_log['failed_challenge_ids'] ?? [];
        $resolvedIds = array_values(array_unique(array_merge($completedIds, $failedIds)));

        return [
            'id' => $this->id,
            'map_id' => $this->map_id,
            'score' => (int) $this->score,
            'earned_points' => $earnedPoints,
            'mistakes_count' => $this->mistakes_count,
            'hearts_remaining' => $this->hearts_remaining,
            'projected_score' => $earnedPoints,
            'time_limit_used' => $this->time_limit_used,
            'time_taken_seconds' => $this->time_taken_seconds,
            'remaining_seconds' => $this->is_completed ? 0 : $remainingSeconds,
            'is_completed' => $this->is_completed,
            'completed_challenge_ids' => $completedIds,
            'failed_challenge_ids' => $failedIds,
            'resolved_challenge_ids' => $resolvedIds,
            'pending_lifeline' => $this->is_completed ? null : ($this->answers_log['pending_lifeline'] ?? null),
            'finish_reason' => $this->answers_log['finish_reason'] ?? null,
            'completed_at' => $this->completed_at?->toIso8601String(),
        ];
    }
}
