<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MediaStreamController extends Controller
{
    public function show(string $path): BinaryFileResponse
    {
        $base = realpath(storage_path('app/public'));
        $clean = ltrim(str_replace(['..', '\\'], ['', '/'], $path), '/');
        $full = $base ? realpath($base . DIRECTORY_SEPARATOR . $clean) : false;

        if (! $base || ! $full || ! str_starts_with($full, $base . DIRECTORY_SEPARATOR) || ! is_file($full)) {
            abort(404);
        }

        return response()->file($full, [
            'Cache-Control' => 'public, max-age=86400',
        ]);
    }
}
