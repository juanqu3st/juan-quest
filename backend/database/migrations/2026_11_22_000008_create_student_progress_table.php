<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('map_id')->constrained('maps')->cascadeOnDelete();
            $table->foreignId('game_session_id')->nullable()->constrained('game_sessions')->nullOnDelete();
            $table->unsignedTinyInteger('score')->default(0);
            $table->unsignedTinyInteger('mistakes_count')->default(0);
            $table->unsignedTinyInteger('hearts_remaining')->default(3);
            $table->unsignedInteger('time_limit_used')->default(60);
            $table->unsignedInteger('time_taken_seconds')->default(0);
            $table->unsignedInteger('attempts')->default(0);
            $table->boolean('is_completed')->default(false);
            $table->json('answers_log')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'map_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_progress');
    }
};
