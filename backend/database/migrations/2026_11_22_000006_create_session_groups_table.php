<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('session_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_session_id')->constrained('game_sessions')->cascadeOnDelete();
            $table->unsignedSmallInteger('group_number');
            $table->string('group_name');
            $table->timestamps();

            $table->unique(['game_session_id', 'group_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('session_groups');
    }
};
