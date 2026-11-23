<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'section',
        'selected_character',
        'current_map_number',
        'activity_status',
        'last_seen_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'current_map_number' => 'integer',
            'last_seen_at' => 'datetime',
        ];
    }

    public function isTeacher(): bool
    {
        return $this->role === 'teacher';
    }

    public function isStudent(): bool
    {
        return $this->role === 'student';
    }

    public function studentProgress(): HasMany
    {
        return $this->hasMany(StudentProgress::class);
    }

    public function taughtSessions(): HasMany
    {
        return $this->hasMany(GameSession::class, 'teacher_id');
    }

    public function sessionParticipations(): HasMany
    {
        return $this->hasMany(SessionParticipant::class);
    }

    public function gameSessions(): BelongsToMany
    {
        return $this->belongsToMany(GameSession::class, 'session_participants')
            ->withPivot(['session_group_id', 'joined_at'])
            ->withTimestamps();
    }
}
