<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Per-question maps (Mapa 1 Multiple Choice, Mapa 5 Decision Quest): exact 0..10 score (no 2-pt floor)
        DB::table('maps')
            ->whereIn('strategy_type', ['multiple_choice', 'decision_quest'])
            ->update(['min_floor_score' => 0]);

        // Whole-map puzzle maps (Mapa 2 Sequence, Mapa 3 Matching, Mapa 4 4 Pics 1 Word): 2-pt minimum floor
        DB::table('maps')
            ->whereIn('strategy_type', ['sequence', 'matching', 'four_pics'])
            ->update(['min_floor_score' => 2]);
    }

    public function down(): void
    {
        DB::table('maps')
            ->whereIn('strategy_type', ['multiple_choice', 'decision_quest'])
            ->update(['min_floor_score' => 2]);
    }
};
