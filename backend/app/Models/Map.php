<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Map extends Model
{
    use HasFactory;

    protected $fillable = [
        'lesson_id',
        'map_number',
        'title',
        'strategy_type',
        'strategy_label',
        'pokus_na_kasanayan',
        'panuto',
        'audio_prompt_path',
        'story_video_path',
        'voiceover_mode',
        'whole_voiceover_path',
        'whole_voiceover_offset_sec',
        'scene_script',
        'youtube_start_sec',
        'youtube_end_sec',
        'max_hearts',
        'perfect_score',
        'min_floor_score',
        'time_limit_seconds',
        'allow_user_time_choice',
        'feedback_correct',
        'praise_audio_path',
        'feedback_wrong',
        'wrong_audio_path',
    ];

    protected function casts(): array
    {
        return [
            'map_number' => 'integer',
            'scene_script' => 'array',
            'whole_voiceover_offset_sec' => 'float',
            'youtube_start_sec' => 'integer',
            'youtube_end_sec' => 'integer',
            'max_hearts' => 'integer',
            'perfect_score' => 'integer',
            'min_floor_score' => 'integer',
            'time_limit_seconds' => 'integer',
            'allow_user_time_choice' => 'boolean',
        ];
    }

    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }

    public function challenges(): HasMany
    {
        return $this->hasMany(Challenge::class)->orderBy('order_index');
    }

    public function studentProgress(): HasMany
    {
        return $this->hasMany(StudentProgress::class);
    }
}
