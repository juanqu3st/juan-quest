<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SessionGroup extends Model
{
    use HasFactory;

    protected $fillable = [
        'game_session_id',
        'group_number',
        'group_name',
        'member_names',
    ];

    protected function casts(): array
    {
        return [
            'group_number' => 'integer',
        ];
    }

    public function gameSession(): BelongsTo
    {
        return $this->belongsTo(GameSession::class);
    }

    public function participants(): HasMany
    {
        return $this->hasMany(SessionParticipant::class);
    }
}
