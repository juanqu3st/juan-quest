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
    protected $signature = 'juanquest:sync-cloudinary
        {--dry-run : List local media paths without uploading}
        {--replace-story-videos : Re-upload local built-in mapa1..mapa5 MP4 story videos, update maps.story_video_path, and delete old Cloudinary videos}';

    protected $description = 'Upload all local built-in videos, challenge images, and audio to Cloudinary and update DB URLs.';

    /** @var array<string, string> */
    private array $uploadedCache = [];

    public function handle(MediaStorageService $media, ScoringService $scoring): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $replaceStoryVideos = (bool) $this->option('replace-story-videos');

        if (! $dryRun && ! $media->usesCloudinary()) {
            $this->error('Cloudinary is not active. Set MEDIA_STORAGE_DRIVER=cloudinary, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET first.');

            return self::FAILURE;
        }

        if ($replaceStoryVideos) {
            return $this->handleReplaceStoryVideos($media, $scoring, $dryRun);
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

    private function handleReplaceStoryVideos(MediaStorageService $media, ScoringService $scoring, bool $dryRun): int
    {
        $builtInVideos = [
            1 => 'videos/mapa1_curfew.mp4',
            2 => 'videos/mapa2_kuwartel.mp4',
            3 => 'videos/mapa3_kariton.mp4',
            4 => 'videos/mapa4_pinto.mp4',
            5 => 'videos/mapa5_magnanakaw.mp4',
        ];

        $maps = Map::whereIn('map_number', array_keys($builtInVideos))
            ->orderBy('lesson_id')
            ->orderBy('map_number')
            ->get();

        if ($maps->isEmpty()) {
            $this->warn('No maps (1..5) found in database.');

            return self::SUCCESS;
        }

        $oldUrlsToDelete = [];
        $updatedMaps = 0;

        foreach ($maps as $map) {
            $relPath = $builtInVideos[(int) $map->map_number] ?? null;
            if (! $relPath) {
                continue;
            }

            $absolute = storage_path('app/public/'.str_replace('/', DIRECTORY_SEPARATOR, $relPath));
            if (! is_file($absolute)) {
                $this->error("Missing local optimized video: {$absolute}");

                return self::FAILURE;
            }

            $sizeMb = round(filesize($absolute) / 1048576, 2);
            $oldPath = (string) ($map->story_video_path ?? '');

            if ($dryRun) {
                $this->line("[dry-run] Map {$map->map_number} (id={$map->id}): {$relPath} ({$sizeMb} MB) would replace: {$oldPath}");
                continue;
            }

            if (! isset($this->uploadedCache[$relPath])) {
                $this->info("Uploading {$relPath} ({$sizeMb} MB) -> Cloudinary (juanquest/videos)...");
                $this->uploadedCache[$relPath] = $media->uploadLocalFileToCloudinary($absolute, 'video', 'juanquest/videos');
            }

            $newUrl = $this->uploadedCache[$relPath];
            $map->story_video_path = $newUrl;
            $map->save();
            $scoring->forgetLessonWorldCache($map->lesson_id);
            $updatedMaps++;

            $this->line("Updated Map {$map->map_number} (id={$map->id}) -> {$newUrl}");

            if (
                $oldPath !== ''
                && $oldPath !== $newUrl
                && (str_starts_with($oldPath, 'http://') || str_starts_with($oldPath, 'https://'))
            ) {
                $oldUrlsToDelete[$oldPath] = true;
            }
        }

        if ($dryRun) {
            $this->info('Dry run complete for --replace-story-videos.');

            return self::SUCCESS;
        }

        // Safely destroy replaced old Cloudinary videos only if no remaining Map references them
        $destroyed = 0;
        foreach (array_keys($oldUrlsToDelete) as $oldUrl) {
            if (! Map::where('story_video_path', $oldUrl)->exists()) {
                $this->line("Deleting replaced Cloudinary video: {$oldUrl}");
                $media->deletePublicPath($oldUrl);
                $destroyed++;
            }
        }

        $uniqueUploaded = count($this->uploadedCache);
        $this->info("Done! Uploaded {$uniqueUploaded} video(s), updated {$updatedMaps} map row(s), and cleaned up {$destroyed} replaced Cloudinary video(s).");

        return self::SUCCESS;
    }
}
