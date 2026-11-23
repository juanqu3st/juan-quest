<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'teacher_id',
        'lesson_id',
        'join_code',
        'class_name',
        'play_mode',
        'members_per_group',
        'groups_locked',
        'status',
    ];

    public function isGroupMode(): bool
    {
        return ($this->play_mode ?? 'group') === 'group';
    }

    public function isIndividualMode(): bool
    {
        return ($this->play_mode ?? 'group') === 'individual';
    }

    protected function casts(): array
    {
        return [
            'members_per_group' => 'integer',
            'groups_locked' => 'boolean',
        ];
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }

    public function groups(): HasMany
    {
        return $this->hasMany(SessionGroup::class)->orderBy('group_number');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(SessionParticipant::class);
    }

    public function studentProgress(): HasMany
    {
        return $this->hasMany(StudentProgress::class);
    }
}
