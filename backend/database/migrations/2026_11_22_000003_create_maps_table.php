<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lesson_id')->constrained('lessons')->cascadeOnDelete();
            $table->unsignedTinyInteger('map_number');
            $table->string('title');
            $table->enum('strategy_type', ['multiple_choice', 'sequence', 'matching', 'four_pics', 'decision_quest']);
            $table->string('strategy_label');
            $table->text('pokus_na_kasanayan');
            $table->text('panuto');
            $table->json('scene_script');
            $table->unsignedInteger('youtube_start_sec')->default(0);
            $table->unsignedInteger('youtube_end_sec')->default(60);
            $table->unsignedTinyInteger('max_hearts')->default(3);
            $table->unsignedTinyInteger('perfect_score')->default(5);
            $table->unsignedTinyInteger('min_floor_score')->default(2);
            $table->unsignedInteger('time_limit_seconds')->default(60);
            $table->boolean('allow_user_time_choice')->default(true);
            $table->text('feedback_correct');
            $table->text('feedback_wrong');
            $table->timestamps();

            $table->unique(['lesson_id', 'map_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maps');
    }
};
