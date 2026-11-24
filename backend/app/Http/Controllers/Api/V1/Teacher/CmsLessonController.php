<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Teacher\UpdateLessonRequest;
use App\Models\Lesson;
use App\Services\MediaStorageService;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;

class CmsLessonController extends Controller
{
    public function index(): JsonResponse
    {
        $lesson = Lesson::with(['maps.challenges'])->where('is_active', true)->first()
            ?? Lesson::with(['maps.challenges'])->first();

        if (! $lesson) {
            return response()->json(['lesson' => null]);
        }

        return response()->json([
            'lesson' => [
                'id' => $lesson->id,
                'title' => $lesson->title,
                'description' => $lesson->description,
                'video_source_type' => $lesson->video_source_type,
                'youtube_url' => $lesson->youtube_url,
                'youtube_video_id' => $lesson->youtube_video_id,
                'uploaded_video_path' => $lesson->uploaded_video_path,
                'praise_audio_path' => $lesson->praise_audio_path,
                'wrong_audio_path' => $lesson->wrong_audio_path,
                'bgm_audio_path' => $lesson->bgm_audio_path,
                'maps' => $lesson->maps->map(fn ($map) => [
                    'id' => $map->id,
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
                    'challenges' => $map->challenges->map(fn ($ch) => [
                        'id' => $ch->id,
                        'order_index' => $ch->order_index,
                        'payload' => $ch->payload,
                        'correct_answer' => $ch->correct_answer,
                    ])->values(),
                ])->values(),
            ],
        ]);
    }

    public function update(
        UpdateLessonRequest $request,
        Lesson $lesson,
        MediaStorageService $media,
        ScoringService $scoring
    ): JsonResponse {
        $validated = $request->validated();
        $videoPath = $lesson->uploaded_video_path;
        $praisePath = $lesson->praise_audio_path;
        $wrongPath = $lesson->wrong_audio_path;
        $bgmPath = $lesson->bgm_audio_path;

        if ($request->boolean('remove_uploaded_video')) {
            $media->deletePublicPath($videoPath);
            $videoPath = null;
        }
        if ($request->hasFile('uploaded_video')) {
            $videoPath = $media->storeLessonVideo($request->file('uploaded_video'), $videoPath);
        }

        if ($request->boolean('remove_praise_audio')) {
            $media->deletePublicPath($praisePath);
            $praisePath = null;
        }
        if ($request->hasFile('praise_audio')) {
            $praisePath = $media->storeAudio($request->file('praise_audio'), $praisePath);
        }

        if ($request->boolean('remove_wrong_audio')) {
            $media->deletePublicPath($wrongPath);
            $wrongPath = null;
        }
        if ($request->hasFile('wrong_audio')) {
            $wrongPath = $media->storeAudio($request->file('wrong_audio'), $wrongPath);
        }

        if ($request->boolean('remove_bgm_audio')) {
            $media->deletePublicPath($bgmPath);
            $bgmPath = null;
        }
        if ($request->hasFile('bgm_audio')) {
            $bgmPath = $media->storeAudio($request->file('bgm_audio'), $bgmPath);
        }

        $lesson->update([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'video_source_type' => $validated['video_source_type'],
            'youtube_url' => $validated['youtube_url'] ?? null,
            'youtube_video_id' => $this->extractYoutubeId($validated['youtube_url'] ?? null),
            'uploaded_video_path' => $videoPath,
            'praise_audio_path' => $praisePath,
            'wrong_audio_path' => $wrongPath,
            'bgm_audio_path' => $bgmPath,
        ]);

        $scoring->forgetLessonWorldCache($lesson->id);

        return response()->json(['lesson' => $lesson->fresh()]);
    }

    private function extractYoutubeId(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        if (preg_match('/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/', $url, $matches)) {
            return $matches[1];
        }

        return null;
    }
}
