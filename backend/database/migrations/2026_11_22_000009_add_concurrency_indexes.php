<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('session_participants', function (Blueprint $table) {
            $table->index(['game_session_id', 'session_group_id'], 'sp_session_group_idx');
        });

        Schema::table('student_progress', function (Blueprint $table) {
            $table->index(['game_session_id', 'is_completed'], 'prog_session_completed_idx');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->index(['role', 'last_seen_at'], 'users_role_seen_idx');
        });
    }

    public function down(): void
    {
        Schema::table('session_participants', function (Blueprint $table) {
            $table->dropIndex('sp_session_group_idx');
        });

        Schema::table('student_progress', function (Blueprint $table) {
            $table->dropIndex('prog_session_completed_idx');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_role_seen_idx');
        });
    }
};
