<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('challenges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('map_id')->constrained('maps')->cascadeOnDelete();
            $table->unsignedTinyInteger('order_index');
            $table->json('payload');
            $table->json('correct_answer');
            $table->timestamps();

            $table->index(['map_id', 'order_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('challenges');
    }
};
