<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('lessons', 'outro_voiceovers')) {
            Schema::table('lessons', function (Blueprint $table) {
                $table->json('outro_voiceovers')->nullable()->after('onboarding_voiceovers');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('lessons', 'outro_voiceovers')) {
            Schema::table('lessons', function (Blueprint $table) {
                $table->dropColumn('outro_voiceovers');
            });
        }
    }
};
