<?php

namespace App\Console\Commands;

use App\Models\Challenge;
use App\Models\Lesson;
use App\Models\Map;
use App\Services\MediaStorageService;
use App\Services\ScoringService;
use Illuminate\Console\Command;

class SyncMediaToCloudinary extends Command
{
    protected $signature = 'juanquest:sync-cloudinary {--dry-run : List local media paths without uploading}';

    protected $description = 'Upload all local built-in videos, challenge images, and audio to Cloudinary and update DB URLs.';

    /** @var array<string, string> */
    private array $uploadedCache = [];

    public function handle(MediaStorageService $media, ScoringService $scoring): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if (! $dryRun && ! $media->usesCloudinary()) {
            $this->error('Cloudinary is not active. Set MEDIA_STORAGE_DRIVER=cloudinary, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET first.');

            return self::FAILURE;
        }

        $updatedCount = 0;

        $migratePath = function (?string $path, string $resourceType, string $folder) use ($media, $dryRun, &$updatedCount): ?string {
            if (! $path || str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
                return $path;
            }

            $clean = ltrim(str_replace('/storage/', '', $path), '/');
            $absolute = storage_path('app/public/'.str_replace('/', DIRECTORY_SEPARATOR, $clean));

            if (! is_file($absolute)) {
                $this->warn("Missing local file, skipping: {$clean}");

                return $path;
            }

            if ($dryRun) {
                $this->line("[dry-run] Would upload {$clean} -> Cloudinary ({$folder})");

                return $path;
            }

            if (isset($this->uploadedCache[$clean])) {
                $updatedCount++;

                return $this->uploadedCache[$clean];
            }

            $this->info("Uploading {$clean} -> {$folder}...");
            $secureUrl = $media->uploadLocalFileToCloudinary($absolute, $resourceType, $folder);
            $this->uploadedCache[$clean] = $secureUrl;
            $updatedCount++;

            return $secureUrl;
        };

        foreach (Lesson::all() as $lesson) {
            $dirty = false;
            foreach ([
                ['uploaded_video_path', 'video', 'juanquest/videos'],
                ['praise_audio_path', 'video', 'juanquest/audio'],
                ['wrong_audio_path', 'video', 'juanquest/audio'],
                ['bgm_audio_path', 'video', 'juanquest/audio'],
            ] as [$col, $type, $folder]) {
                $next = $migratePath($lesson->{$col}, $type, $folder);
                if ($next !== $lesson->{$col}) {
                    $lesson->{$col} = $next;
                    $dirty = true;
                }
            }
            if ($dirty && ! $dryRun) {
                $lesson->save();
                $scoring->forgetLessonWorldCache($lesson->id);
            }
        }

        foreach (Map::all() as $map) {
            $dirty = false;
            foreach ([
                ['story_video_path', 'video', 'juanquest/videos'],
                ['audio_prompt_path', 'video', 'juanquest/audio'],
                ['whole_voiceover_path', 'video', 'juanquest/audio'],
                ['praise_audio_path', 'video', 'juanquest/audio'],
                ['wrong_audio_path', 'video', 'juanquest/audio'],
            ] as [$col, $type, $folder]) {
                $next = $migratePath($map->{$col}, $type, $folder);
                if ($next !== $map->{$col}) {
                    $map->{$col} = $next;
                    $dirty = true;
                }
            }

            $scenes = is_array($map->scene_script) ? $map->scene_script : [];
            $scenesChanged = false;
            foreach ($scenes as $idx => $scene) {
                if (! empty($scene['audio_path'])) {
                    $nextAudio = $migratePath($scene['audio_path'], 'video', 'juanquest/audio');
                    if ($nextAudio !== $scene['audio_path']) {
                        $scenes[$idx]['audio_path'] = $nextAudio;
                        $scenesChanged = true;
                    }
                }
            }
            if ($scenesChanged) {
                $map->scene_script = $scenes;
                $dirty = true;
            }

            if ($dirty && ! $dryRun) {
                $map->save();
                $scoring->forgetLessonWorldCache($map->lesson_id);
            }
        }

        foreach (Challenge::with('map')->get() as $challenge) {
            $payload = is_array($challenge->payload) ? $challenge->payload : [];
            $dirty = false;

            if (! empty($payload['image']) && is_string($payload['image'])) {
                $nextImg = $migratePath($payload['image'], 'image', 'juanquest/challenges');
                if ($nextImg !== $payload['image']) {
                    $payload['image'] = $nextImg;
                    $dirty = true;
                }
            }

            if (! empty($payload['images']) && is_array($payload['images'])) {
                foreach ($payload['images'] as $i => $img) {
                    if (is_string($img) && $img !== '') {
                        $nextImg = $migratePath($img, 'image', 'juanquest/challenges');
                        if ($nextImg !== $img) {
                            $payload['images'][$i] = $nextImg;
                            $dirty = true;
                        }
                    }
                }
            }

            if ($dirty && ! $dryRun) {
                $challenge->payload = $payload;
                $challenge->save();
                if ($challenge->map) {
                    $scoring->forgetLessonWorldCache($challenge->map->lesson_id);
                }
            }
        }

        if ($dryRun) {
            $this->info('Dry run complete.');
        } else {
            $uniqueUploads = count($this->uploadedCache);
            $this->info("Done! Uploaded {$uniqueUploads} unique file(s) to Cloudinary and updated {$updatedCount} DB reference(s).");
        }

        return self::SUCCESS;
    }
}
