<?php

namespace App\Http\Controllers\Api\V1\Teacher;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Teacher\UpdateMapRequest;
use App\Models\Map;
use App\Services\MediaStorageService;
use App\Services\ScoringService;
use Illuminate\Http\JsonResponse;

class CmsMapController extends Controller
{
    public function update(
        UpdateMapRequest $request,
        Map $map,
        MediaStorageService $media,
        ScoringService $scoring
    ): JsonResponse {
        $validated = $request->validated();

        $audioPromptPath = $map->audio_prompt_path;
        $storyVideoPath = $map->story_video_path;
        $wholeVoiceoverPath = $map->whole_voiceover_path;
        $praisePath = $map->praise_audio_path;
        $wrongPath = $map->wrong_audio_path;

        if ($request->boolean('remove_audio_prompt')) {
            $media->deletePublicPath($audioPromptPath);
            $audioPromptPath = null;
        }
        if ($request->hasFile('audio_prompt')) {
            $audioPromptPath = $media->storeAudio($request->file('audio_prompt'), $audioPromptPath);
        }

        if ($request->boolean('remove_story_video')) {
            $media->deletePublicPath($storyVideoPath);
            $storyVideoPath = null;
        }
        if ($request->hasFile('story_video')) {
            $storyVideoPath = $media->storeLessonVideo($request->file('story_video'), $storyVideoPath);
        }

        if ($request->boolean('remove_whole_voiceover')) {
            $media->deletePublicPath($wholeVoiceoverPath);
            $wholeVoiceoverPath = null;
        }
        if ($request->hasFile('whole_voiceover')) {
            $wholeVoiceoverPath = $media->storeAudio($request->file('whole_voiceover'), $wholeVoiceoverPath);
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

        // Preserve existing per-scene audio paths and process uploads / removals
        $existingScenes = is_array($map->scene_script) ? $map->scene_script : [];
        $sceneScript = array_values($validated['scene_script']);
        $removeSceneIndices = collect($request->input('remove_scene_audios', []))
            ->map(fn ($v) => (int) $v)
            ->all();

        foreach ($sceneScript as $idx => &$scene) {
            $prevPath = $scene['audio_path'] ?? ($existingScenes[$idx]['audio_path'] ?? null);

            if (in_array($idx, $removeSceneIndices, true)) {
                $media->deletePublicPath($prevPath);
                $prevPath = null;
            }

            if ($request->hasFile("scene_audios.{$idx}")) {
                $prevPath = $media->storeAudio($request->file("scene_audios.{$idx}"), $prevPath);
            }

            $scene['audio_path'] = $prevPath;
            if (isset($scene['start_sec']) && $scene['start_sec'] !== '' && $scene['start_sec'] !== null) {
                $scene['start_sec'] = max(0, round((float) $scene['start_sec'], 2));
            }
            if (isset($scene['end_sec']) && $scene['end_sec'] !== '' && $scene['end_sec'] !== null) {
                $scene['end_sec'] = max(1, round((float) $scene['end_sec'], 2));
            }
            $scene['audio_offset_sec'] = isset($scene['audio_offset_sec']) && $scene['audio_offset_sec'] !== ''
                ? max(-15, min(15, round((float) $scene['audio_offset_sec'], 2)))
                : 0.0;
        }
        unset($scene);

        // Clean up any audio files belonging to scene rows that were deleted from the script
        $keptAudioPaths = collect($sceneScript)->pluck('audio_path')->filter()->all();
        foreach ($existingScenes as $oldScene) {
            $oldAudio = $oldScene['audio_path'] ?? null;
            if ($oldAudio && ! in_array($oldAudio, $keptAudioPaths, true)) {
                $media->deletePublicPath($oldAudio);
            }
        }

        $map->update([
            'title' => $validated['title'],
            'strategy_label' => $validated['strategy_label'],
            'pokus_na_kasanayan' => $validated['pokus_na_kasanayan'],
            'panuto' => $validated['panuto'],
            'audio_prompt_path' => $audioPromptPath,
            'story_video_path' => $storyVideoPath,
            'voiceover_mode' => $validated['voiceover_mode'] ?? $map->voiceover_mode ?? 'default',
            'whole_voiceover_path' => $wholeVoiceoverPath,
            'whole_voiceover_offset_sec' => array_key_exists('whole_voiceover_offset_sec', $validated) && $validated['whole_voiceover_offset_sec'] !== null
                ? round((float) $validated['whole_voiceover_offset_sec'], 2)
                : ($map->whole_voiceover_offset_sec ?? 0.0),
            'scene_script' => $sceneScript,
            'youtube_start_sec' => $validated['youtube_start_sec'],
            'youtube_end_sec' => $validated['youtube_end_sec'],
            'max_hearts' => $validated['max_hearts'],
            'time_limit_seconds' => $validated['time_limit_seconds'],
            'allow_user_time_choice' => false,
            'feedback_correct' => $validated['feedback_correct'],
            'praise_audio_path' => $praisePath,
            'feedback_wrong' => $validated['feedback_wrong'],
            'wrong_audio_path' => $wrongPath,
        ]);

        $scoring->forgetLessonWorldCache($map->lesson_id);

        return response()->json(['map' => $map->fresh()]);
    }
}
