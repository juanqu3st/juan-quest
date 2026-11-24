<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class MediaStorageService
{
    /**
     * Store a challenge image locally (default) or upload directly to Cloudinary
     * when MEDIA_STORAGE_DRIVER=cloudinary is configured.
     */
    public function storeChallengeImage(UploadedFile $file, ?string $existingPath = null): string
    {
        if ($existingPath) {
            $this->deletePublicPath($existingPath);
        }

        if ($this->usesCloudinary()) {
            return $this->uploadFileToCloudinary($file->getRealPath(), $file->getClientOriginalName(), 'image', 'juanquest/challenges');
        }

        return $file->store('challenges', 'public');
    }

    /**
     * Store a lesson story video locally (default) or upload directly to Cloudinary
     * when MEDIA_STORAGE_DRIVER=cloudinary is configured.
     */
    public function storeLessonVideo(UploadedFile $file, ?string $existingPath = null): string
    {
        if ($existingPath) {
            $this->deletePublicPath($existingPath);
        }

        if ($this->usesCloudinary()) {
            return $this->uploadFileToCloudinary($file->getRealPath(), $file->getClientOriginalName(), 'video', 'juanquest/videos');
        }

        return $file->store('videos', 'public');
    }

    /**
     * Store teacher-uploaded feedback/prompt/VO audio (or extract audio track from uploaded
     * video files like .mp4/.mov/.webm) locally or upload to Cloudinary as clean universal MP3.
     */
    public function storeAudio(UploadedFile $file, ?string $existingPath = null): string
    {
        if ($existingPath) {
            $this->deletePublicPath($existingPath);
        }

        if ($this->usesCloudinary()) {
            try {
                $uploadedUrl = $this->uploadFileToCloudinary(
                    $file->getRealPath(),
                    $file->getClientOriginalName(),
                    'video',
                    'juanquest/audio',
                    ['format' => 'mp3']
                );

                return $this->toCloudinaryMp3Url($uploadedUrl);
            } catch (RuntimeException $e) {
                Log::warning('Cloudinary direct MP3 transcoding fell back to on-the-fly MP3 delivery.', [
                    'file' => $file->getClientOriginalName(),
                    'error' => $e->getMessage(),
                ]);

                $rawUrl = $this->uploadFileToCloudinary(
                    $file->getRealPath(),
                    $file->getClientOriginalName(),
                    'video',
                    'juanquest/audio'
                );

                return $this->toCloudinaryMp3Url($rawUrl);
            }
        }

        return $file->store('audio', 'public');
    }

    /**
     * Rewrite a Cloudinary video/audio delivery URL to serve an on-the-fly extracted MP3 audio stream.
     */
    private function toCloudinaryMp3Url(string $url): string
    {
        if (! str_contains($url, '/video/upload/')) {
            return $url;
        }

        return (string) preg_replace('/\.[^.?\/]+(\?.*)?$/', '.mp3$1', $url);
    }

    /**
     * Upload an existing file from local disk directly to Cloudinary (used by juanquest:sync-cloudinary).
     */
    public function uploadLocalFileToCloudinary(string $absolutePath, string $resourceType, string $folder): string
    {
        if (! $this->usesCloudinary()) {
            throw new RuntimeException('Cloudinary is not enabled. Set MEDIA_STORAGE_DRIVER=cloudinary and CLOUDINARY_* keys first.');
        }

        if (! is_file($absolutePath)) {
            throw new RuntimeException("Local media file not found: {$absolutePath}");
        }

        return $this->uploadFileToCloudinary($absolutePath, basename($absolutePath), $resourceType, $folder);
    }

    /**
     * Delete a previously stored media path from local public storage OR directly from Cloudinary
     * (via signed Destroy API with CDN cache invalidation) so removed/replaced assets never waste quota.
     */
    public function deletePublicPath(?string $path): void
    {
        if (! $path) {
            return;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $this->deleteFromCloudinaryUrl($path);

            return;
        }

        $clean = ltrim(str_replace('/storage/', '', $path), '/');
        if ($clean !== '' && Storage::disk('public')->exists($clean)) {
            Storage::disk('public')->delete($clean);
        }
    }

    public function usesCloudinary(): bool
    {
        return config('services.cloudinary.driver', 'local') === 'cloudinary'
            && ! empty(config('services.cloudinary.cloud_name'));
    }

    /**
     * Extract Cloudinary cloud_name, resource_type, and public_id from a standard Cloudinary delivery URL.
     *
     * @return array{cloud_name: string, resource_type: string, public_id: string}|null
     */
    public function parseCloudinaryUrl(string $url): ?array
    {
        if (! preg_match('#^https?://res\.cloudinary\.com/([^/]+)/(image|video|raw)/upload/(.+)$#i', $url, $matches)) {
            return null;
        }

        $cloudName = $matches[1];
        $resourceType = strtolower($matches[2]);
        $tail = explode('?', $matches[3], 2)[0];

        // Strip any delivery transformation segments before `v123456/` if present
        if (preg_match('#(?:^|/)v\d+/(.+)$#', $tail, $verMatch)) {
            $tail = $verMatch[1];
        }

        // Remove file extension to obtain the exact public_id (folder/filename)
        $publicId = preg_replace('/\.[^.\/]+$/', '', ltrim($tail, '/'));
        if (! is_string($publicId) || $publicId === '') {
            return null;
        }

        return [
            'cloud_name' => $cloudName,
            'resource_type' => $resourceType,
            'public_id' => urldecode($publicId),
        ];
    }

    private function deleteFromCloudinaryUrl(string $url): void
    {
        $parsed = $this->parseCloudinaryUrl($url);
        if (! $parsed) {
            return;
        }

        $cloudName = (string) config('services.cloudinary.cloud_name', '');
        $apiKey = (string) config('services.cloudinary.api_key', '');
        $apiSecret = (string) config('services.cloudinary.api_secret', '');

        if ($cloudName === '' || $apiKey === '' || $apiSecret === '') {
            return;
        }

        // Safety guard: only destroy assets belonging to the configured Cloudinary cloud
        if (strcasecmp($parsed['cloud_name'], $cloudName) !== 0) {
            return;
        }

        try {
            $timestamp = (string) time();
            $signParams = [
                'invalidate' => 'true',
                'public_id' => $parsed['public_id'],
                'timestamp' => $timestamp,
            ];
            ksort($signParams);
            $toSign = collect($signParams)->map(fn ($v, $k) => "{$k}={$v}")->implode('&');

            $response = Http::timeout(20)->asForm()->post(
                "https://api.cloudinary.com/v1_1/{$cloudName}/{$parsed['resource_type']}/destroy",
                [
                    'public_id' => $parsed['public_id'],
                    'invalidate' => 'true',
                    'timestamp' => $timestamp,
                    'api_key' => $apiKey,
                    'signature' => sha1($toSign.$apiSecret),
                ]
            );

            if (! $response->successful()) {
                Log::warning('Cloudinary destroy returned non-2xx response.', [
                    'public_id' => $parsed['public_id'],
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('Cloudinary asset deletion failed cleanly without blocking CMS save.', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function uploadFileToCloudinary(
        string $absolutePath,
        string $filename,
        string $resourceType,
        string $folder,
        array $extraParams = []
    ): string
    {
        $cloudName = (string) config('services.cloudinary.cloud_name', '');
        $uploadPreset = (string) config('services.cloudinary.upload_preset', '');
        $apiKey = (string) config('services.cloudinary.api_key', '');
        $apiSecret = (string) config('services.cloudinary.api_secret', '');

        $params = ['folder' => $folder];

        // Prefer signed API uploads when API key & secret are configured (supports auto-delete, mp3 transcoding & secure presets)
        if ($apiKey !== '' && $apiSecret !== '') {
            $params = array_merge($params, $extraParams);
            $timestamp = (string) time();
            $params['timestamp'] = $timestamp;
            ksort($params);
            $toSign = collect($params)->map(fn ($v, $k) => "{$k}={$v}")->implode('&');
            $params['api_key'] = $apiKey;
            $params['signature'] = sha1($toSign.$apiSecret);
        } elseif ($uploadPreset !== '') {
            $params['upload_preset'] = $uploadPreset;
        } else {
            throw new RuntimeException('Cloudinary is enabled, but CLOUDINARY_API_KEY/SECRET or CLOUDINARY_UPLOAD_PRESET is missing.');
        }

        $stream = fopen($absolutePath, 'r');
        if ($stream === false) {
            throw new RuntimeException("Unable to read upload file: {$absolutePath}");
        }

        try {
            $response = Http::timeout(120)
                ->attach('file', $stream, $filename)
                ->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", $params);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        if (! $response->successful() || ! $response->json('secure_url')) {
            throw new RuntimeException('Cloudinary upload failed: '.$response->body());
        }

        return (string) $response->json('secure_url');
    }
}
