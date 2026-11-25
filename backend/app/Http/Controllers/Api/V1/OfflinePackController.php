<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\V1\LessonResource;
use App\Models\Challenge;
use App\Models\Lesson;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class OfflinePackController extends Controller
{
    /**
     * Public cacheable Offline PWA Pack: returns lesson, 5 maps, challenge payloads, media manifest,
     * and SHA-256 salted answer hashes (NEVER plain-text correct_answer!).
     */
    public function show(ScoringService $scoring): JsonResponse
    {
        $lessonId = Lesson::where('is_active', true)->value('id') ?? Lesson::value('id');
        if (! $lessonId) {
            return response()->json(['message' => 'Walang aktibong aralin.'], 404);
        }

        $lesson = $scoring->getCachedLessonWorld($lessonId);
        if (! $lesson) {
            return response()->json(['message' => 'Hindi mahanap ang aralin.'], 404);
        }

        $packSalt = substr(hash('sha256', (string) config('app.key')."|jq-offline-pack|{$lesson->id}"), 0, 16);

        $videos = [];
        $images = [];
        $audio = [];

        $addUnique = static function (array &$bucket, ?string $path): void {
            if ($path && trim($path) !== '' && ! in_array($path, $bucket, true)) {
                $bucket[] = $path;
            }
        };

        $addUnique($videos, $lesson->uploaded_video_path);
        $addUnique($audio, $lesson->praise_audio_path);
        $addUnique($audio, $lesson->wrong_audio_path);
        $addUnique($audio, $lesson->bgm_audio_path);

        $mapsPayload = $lesson->maps->sortBy('map_number')->values()->map(function ($map) use (
            $packSalt,
            &$videos,
            &$images,
            &$audio,
            $addUnique
        ) {
            $addUnique($videos, $map->story_video_path);
            $addUnique($audio, $map->audio_prompt_path);
            $addUnique($audio, $map->whole_voiceover_path);
            $addUnique($audio, $map->praise_audio_path);
            $addUnique($audio, $map->wrong_audio_path);

            foreach ((array) ($map->scene_script ?? []) as $scene) {
                if (is_array($scene) && ! empty($scene['audio_path'])) {
                    $addUnique($audio, $scene['audio_path']);
                }
            }

            $challengesPayload = $map->challenges->sortBy('order_index')->values()->map(function (Challenge $ch) use (
                $map,
                $packSalt,
                &$images,
                $addUnique
            ) {
                $p = is_array($ch->payload) ? $ch->payload : [];
                if (! empty($p['image']) && is_string($p['image'])) {
                    $addUnique($images, $p['image']);
                }
                if (! empty($p['images']) && is_array($p['images'])) {
                    foreach ($p['images'] as $img) {
                        if (is_string($img) && $img !== '') {
                            $addUnique($images, $img);
                        }
                    }
                }

                return [
                    'id' => $ch->id,
                    'map_id' => $ch->map_id,
                    'order_index' => $ch->order_index,
                    'payload' => $p,
                    'answer_hash' => $this->buildAnswerHash($map->strategy_type, $ch, $packSalt),
                ];
            })->values();

            return [
                'id' => $map->id,
                'lesson_id' => $map->lesson_id,
                'map_number' => $map->map_number,
                'title' => $map->title,
                'strategy_type' => $map->strategy_type,
                'strategy_label' => $map->strategy_label,
                'pokus_na_kasanayan' => $map->pokus_na_kasanayan,
                'panuto' => $map->panuto,
                'audio_prompt_path' => $map->audio_prompt_path,
                'story_video_path' => $map->story_video_path,
                'voiceover_mode' => $map->voiceover_mode ?? 'default',
                'whole_voiceover_path' => $map->whole_voiceover_path,
                'whole_voiceover_offset_sec' => (float) ($map->whole_voiceover_offset_sec ?? 0),
                'scene_script' => $map->scene_script,
                'youtube_start_sec' => $map->youtube_start_sec,
                'youtube_end_sec' => $map->youtube_end_sec,
                'max_hearts' => $map->max_hearts,
                'perfect_score' => $map->perfect_score,
                'min_floor_score' => $map->min_floor_score,
                'time_limit_seconds' => $map->time_limit_seconds,
                'allow_user_time_choice' => false,
                'feedback_correct' => $map->feedback_correct,
                'praise_audio_path' => $map->praise_audio_path,
                'feedback_wrong' => $map->feedback_wrong,
                'wrong_audio_path' => $map->wrong_audio_path,
                'challenges' => $challengesPayload,
            ];
        })->values();

        $versionFingerprint = substr(hash('sha256', json_encode([
            'lesson_updated' => $lesson->updated_at?->timestamp,
            'maps' => $mapsPayload->map(fn ($m) => [
                $m['id'],
                count($m['challenges']),
                collect($m['challenges'])->map(fn ($c) => [$c['id'], $c['answer_hash'], $c['payload']])->values(),
            ])->values(),
            'challenge_timestamps' => $lesson->maps->flatMap(
                fn ($m) => $m->challenges->map(fn ($c) => [$c->id, $c->updated_at?->timestamp])
            )->values(),
            'videos' => $videos,
            'images' => $images,
            'audio' => $audio,
        ])), 0, 12);

        return response()->json([
            'version' => $versionFingerprint,
            'pack_salt' => $packSalt,
            'generated_at' => now()->toIso8601String(),
            'max_total_score' => (int) ($lesson->maps->sum('perfect_score') ?: 50),
            'lesson' => new LessonResource($lesson),
            'maps' => $mapsPayload,
            'media_manifest' => [
                'videos' => $videos,
                'images' => $images,
                'audio' => $audio,
            ],
        ])->header('Cache-Control', 'public, max-age=60');
    }

    /**
     * Convert server-only correct_answer into irreversible salted SHA-256 verification hashes.
     *
     * @return array<string, mixed>
     */
    private function buildAnswerHash(string $strategyType, Challenge $challenge, string $salt): array
    {
        $ans = is_array($challenge->correct_answer) ? $challenge->correct_answer : [];
        $id = $challenge->id;

        if ($strategyType === 'multiple_choice' || $strategyType === 'decision_quest') {
            $choice = strtoupper(trim((string) ($ans['choice'] ?? '')));

            return [
                'mode' => 'choice',
                'hash' => hash('sha256', "{$id}:choice:{$choice}:{$salt}"),
            ];
        }

        if ($strategyType === 'four_pics') {
            $word = strtoupper((string) preg_replace('/\s+/', '', trim((string) ($ans['word'] ?? ''))));

            return [
                'mode' => 'word',
                'hash' => hash('sha256', "{$id}:word:{$word}:{$salt}"),
            ];
        }

        if ($strategyType === 'sequence') {
            $order = array_values(array_map('intval', (array) ($ans['order'] ?? [])));
            $slotHashes = [];
            foreach ($order as $pos => $itemId) {
                $slotHashes[$pos] = hash('sha256', "{$id}:seq:{$pos}:{$itemId}:{$salt}");
            }

            return [
                'mode' => 'sequence',
                'total' => count($order),
                'slot_hashes' => $slotHashes,
            ];
        }

        if ($strategyType === 'matching') {
            $pairs = (array) ($ans['pairs'] ?? []);
            $pairHashes = [];
            foreach ($pairs as $leftId => $rightId) {
                $key = (string) $leftId;
                $val = strtoupper(trim((string) $rightId));
                $pairHashes[$key] = hash('sha256', "{$id}:match:{$key}:{$val}:{$salt}");
            }

            return [
                'mode' => 'matching',
                'total' => count($pairs),
                'pair_hashes' => $pairHashes,
            ];
        }

        return ['mode' => 'unknown'];
    }
}
