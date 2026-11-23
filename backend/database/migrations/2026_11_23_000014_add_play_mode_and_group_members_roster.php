<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            if (! Schema::hasColumn('game_sessions', 'play_mode')) {
                $table->string('play_mode', 20)->default('group')->after('class_name');
            }
        });

        Schema::table('session_groups', function (Blueprint $table) {
            if (! Schema::hasColumn('session_groups', 'member_names')) {
                $table->text('member_names')->nullable()->after('group_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('session_groups', function (Blueprint $table) {
            if (Schema::hasColumn('session_groups', 'member_names')) {
                $table->dropColumn('member_names');
            }
        });

        Schema::table('game_sessions', function (Blueprint $table) {
            if (Schema::hasColumn('game_sessions', 'play_mode')) {
                $table->dropColumn('play_mode');
            }
        });
    }
};
