<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE `users` MODIFY COLUMN `selected_character` VARCHAR(32) NOT NULL DEFAULT 'juan'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::table('users')
                ->whereNotIn('selected_character', ['juan', 'pedro'])
                ->update(['selected_character' => 'juan']);

            DB::statement("ALTER TABLE `users` MODIFY COLUMN `selected_character` ENUM('juan', 'pedro') NOT NULL DEFAULT 'juan'");
        }
    }
};
