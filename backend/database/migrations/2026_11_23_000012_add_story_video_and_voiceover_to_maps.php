<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->string('story_video_path')->nullable()->after('audio_prompt_path');
            $table->string('voiceover_mode', 20)->default('default')->after('story_video_path');
            $table->string('whole_voiceover_path')->nullable()->after('voiceover_mode');
        });
    }

    public function down(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->dropColumn(['story_video_path', 'voiceover_mode', 'whole_voiceover_path']);
        });
    }
};
