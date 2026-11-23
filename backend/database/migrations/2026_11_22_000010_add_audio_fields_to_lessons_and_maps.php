<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lessons', function (Blueprint $table) {
            $table->string('praise_audio_path')->nullable()->after('uploaded_video_path');
            $table->string('wrong_audio_path')->nullable()->after('praise_audio_path');
            $table->string('bgm_audio_path')->nullable()->after('wrong_audio_path');
        });

        Schema::table('maps', function (Blueprint $table) {
            $table->string('audio_prompt_path')->nullable()->after('panuto');
            $table->string('praise_audio_path')->nullable()->after('feedback_correct');
            $table->string('wrong_audio_path')->nullable()->after('feedback_wrong');
        });

        // Teacher now exclusively controls each map's timer.
        DB::table('maps')->update(['allow_user_time_choice' => false]);
    }

    public function down(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->dropColumn(['audio_prompt_path', 'praise_audio_path', 'wrong_audio_path']);
        });

        Schema::table('lessons', function (Blueprint $table) {
            $table->dropColumn(['praise_audio_path', 'wrong_audio_path', 'bgm_audio_path']);
        });
    }
};
