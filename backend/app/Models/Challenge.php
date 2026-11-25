<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Challenge extends Model
{
    use HasFactory;

    /**
     * Touch parent map on create/update/delete so cached offline PWA pack versions invalidate cleanly.
     *
     * @var list<string>
     */
    protected $touches = ['map'];

    protected $fillable = [
        'map_id',
        'order_index',
        'payload',
        'correct_answer',
    ];

    /**
     * Never expose answer keys in serialized models or Inertia props.
     *
     * @var list<string>
     */
    protected $hidden = [
        'correct_answer',
    ];

    protected function casts(): array
    {
        return [
            'order_index' => 'integer',
            'payload' => 'array',
            'correct_answer' => 'array',
        ];
    }

    public function map(): BelongsTo
    {
        return $this->belongsTo(Map::class);
    }
}
