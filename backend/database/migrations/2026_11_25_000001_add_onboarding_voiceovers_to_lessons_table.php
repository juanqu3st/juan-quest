<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('lessons', 'onboarding_voiceovers')) {
            Schema::table('lessons', function (Blueprint $table) {
                $table->json('onboarding_voiceovers')->nullable()->after('bgm_audio_path');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('lessons', 'onboarding_voiceovers')) {
            Schema::table('lessons', function (Blueprint $table) {
                $table->dropColumn('onboarding_voiceovers');
            });
        }
    }
};
