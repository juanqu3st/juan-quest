<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lesson extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'video_source_type',
        'youtube_url',
        'youtube_video_id',
        'uploaded_video_path',
        'praise_audio_path',
        'wrong_audio_path',
        'bgm_audio_path',
        'onboarding_voiceovers',
        'outro_voiceovers',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'onboarding_voiceovers' => 'array',
            'outro_voiceovers' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function maps(): HasMany
    {
        return $this->hasMany(Map::class)->orderBy('map_number');
    }

    public function gameSessions(): HasMany
    {
        return $this->hasMany(GameSession::class);
    }
}
