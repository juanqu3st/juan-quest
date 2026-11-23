<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentProgress extends Model
{
    use HasFactory;

    protected $table = 'student_progress';

    protected $fillable = [
        'user_id',
        'map_id',
        'game_session_id',
        'score',
        'mistakes_count',
        'hearts_remaining',
        'time_limit_used',
        'time_taken_seconds',
        'attempts',
        'is_completed',
        'answers_log',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'integer',
            'mistakes_count' => 'integer',
            'hearts_remaining' => 'integer',
            'time_limit_used' => 'integer',
            'time_taken_seconds' => 'integer',
            'attempts' => 'integer',
            'is_completed' => 'boolean',
            'answers_log' => 'array',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function map(): BelongsTo
    {
        return $this->belongsTo(Map::class);
    }

    public function gameSession(): BelongsTo
    {
        return $this->belongsTo(GameSession::class);
    }
}
