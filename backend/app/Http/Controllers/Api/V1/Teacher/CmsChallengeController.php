<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Teacher\StoreChallengeRequest;
use App\Http\Requests\Api\V1\Teacher\UpdateChallengeRequest;
use App\Models\Challenge;
use App\Models\Map;
use App\Services\MediaStorageService;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CmsChallengeController extends Controller
{
    public function store(
        StoreChallengeRequest $request,
        Map $map,
        MediaStorageService $media,
        ScoringService $scoring
    ): JsonResponse {
        $validated = $request->validated();
        [$payload, $correctAnswer] = $this->preparePayload(
            $request,
            $map,
            $validated['payload'],
            $validated['correct_answer'],
            $media
        );

        $challenge = Challenge::create([
            'map_id' => $map->id,
            'order_index' => $validated['order_index'] ?? (($map->challenges()->max('order_index') ?? 0) + 1),
            'payload' => $payload,
            'correct_answer' => $correctAnswer,
        ]);

        $scoring->forgetLessonWorldCache($map->lesson_id);

        return response()->json([
            'challenge' => [
                'id' => $challenge->id,
                'order_index' => $challenge->order_index,
                'payload' => $challenge->payload,
                'correct_answer' => $challenge->correct_answer,
            ],
        ], 201);
    }

    public function update(
        UpdateChallengeRequest $request,
        Challenge $challenge,
        MediaStorageService $media,
        ScoringService $scoring
    ): JsonResponse {
        $validated = $request->validated();
        $map = $challenge->map;

        $existingPayload = is_array($challenge->payload) ? $challenge->payload : [];

        [$payload, $correctAnswer] = $this->preparePayload(
            $request,
            $map,
            $validated['payload'],
            $validated['correct_answer'],
            $media,
            $existingPayload
        );

        $challenge->update([
            'order_index' => $validated['order_index'],
            'payload' => $payload,
            'correct_answer' => $correctAnswer,
        ]);

        $scoring->forgetLessonWorldCache($map->lesson_id);

        return response()->json([
            'challenge' => [
                'id' => $challenge->id,
                'order_index' => $challenge->order_index,
                'payload' => $challenge->payload,
                'correct_answer' => $challenge->correct_answer,
            ],
        ]);
    }

    public function destroy(Challenge $challenge, MediaStorageService $media, ScoringService $scoring): JsonResponse
    {
        $lessonId = $challenge->map->lesson_id;
        $payload = is_array($challenge->payload) ? $challenge->payload : [];

        if (! empty($payload['image']) && is_string($payload['image'])) {
            $media->deletePublicPath($payload['image']);
        }
        if (! empty($payload['images']) && is_array($payload['images'])) {
            foreach ($payload['images'] as $img) {
                if (is_string($img) && $img !== '') {
                    $media->deletePublicPath($img);
                }
            }
        }

        $challenge->delete();
        $scoring->forgetLessonWorldCache($lessonId);

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $existingPayload
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function preparePayload(
        Request $request,
        Map $map,
        array $payload,
        array $correctAnswer,
        MediaStorageService $media,
        array $existingPayload = []
    ): array {
        $oldSingleImage = isset($existingPayload['image']) && is_string($existingPayload['image'])
            ? $existingPayload['image']
            : null;
        $incomingSingleImage = isset($payload['image']) && is_string($payload['image']) && trim($payload['image']) !== ''
            ? $payload['image']
            : null;

        if ($request->hasFile('image')) {
            $payload['image'] = $media->storeChallengeImage($request->file('image'), $oldSingleImage ?? $incomingSingleImage);
        } elseif ($request->boolean('remove_image') || ($oldSingleImage && $incomingSingleImage === null)) {
            if ($oldSingleImage) {
                $media->deletePublicPath($oldSingleImage);
            }
            $payload['image'] = null;
        }

        if ($map->strategy_type !== 'four_pics') {
            return [$payload, $correctAnswer];
        }

        $existingImages = is_array($existingPayload['images'] ?? null) ? $existingPayload['images'] : [];
        $images = is_array($payload['images'] ?? null) ? $payload['images'] : [null, null, null, null];
        for ($i = 0; $i < 4; $i++) {
            $oldSlot = isset($existingImages[$i]) && is_string($existingImages[$i]) && trim($existingImages[$i]) !== ''
                ? $existingImages[$i]
                : null;
            $incomingSlot = isset($images[$i]) && is_string($images[$i]) && trim($images[$i]) !== ''
                ? $images[$i]
                : null;

            if ($request->hasFile("images.{$i}")) {
                $images[$i] = $media->storeChallengeImage($request->file("images.{$i}"), $oldSlot ?? $incomingSlot);
            } elseif ($oldSlot && $incomingSlot === null) {
                $media->deletePublicPath($oldSlot);
                $images[$i] = null;
            } else {
                $images[$i] = $incomingSlot;
            }
        }
        $payload['images'] = array_slice(array_pad($images, 4, null), 0, 4);

        $word = strtoupper((string) preg_replace('/\s+/', '', (string) ($correctAnswer['word'] ?? '')));
        $correctAnswer['word'] = $word;
        $payload['word_length'] = strlen($word);

        $letters = str_split($word);
        $pool = str_split('ABKDEGHILMNOPRSTUWY');
        while (count($letters) < max(8, strlen($word) + 3)) {
            $letters[] = $pool[array_rand($pool)];
        }
        shuffle($letters);
        $payload['scrambled_letters'] = $letters;

        return [$payload, $correctAnswer];
    }
}
