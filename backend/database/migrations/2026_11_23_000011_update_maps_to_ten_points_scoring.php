<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->unsignedTinyInteger('perfect_score')->default(10)->change();
            $table->unsignedTinyInteger('min_floor_score')->default(2)->change();
        });

        DB::table('maps')->update([
            'perfect_score' => 10,
            'min_floor_score' => 2,
        ]);

        // Rescale existing completed scores from the legacy 5-pt scale to the final 10-pt per-map scale (MySQL & SQLite safe).
        $rows = DB::table('student_progress')
            ->where('is_completed', true)
            ->where('score', '<=', 5)
            ->get(['id', 'score']);

        foreach ($rows as $row) {
            $scaled = min(10, max(2, ((int) $row->score) * 2));
            DB::table('student_progress')->where('id', $row->id)->update(['score' => $scaled]);
        }
    }

    public function down(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->unsignedTinyInteger('perfect_score')->default(5)->change();
        });
    }
};
