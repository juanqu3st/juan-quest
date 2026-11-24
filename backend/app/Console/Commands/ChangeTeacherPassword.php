<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class ChangeTeacherPassword extends Command
{
    protected $signature = 'juanquest:teacher-password
                            {--email=teacher@juanquest.ph : Teacher email address}
                            {--password= : Optional password (omit to type securely without shell history)}';

    protected $description = 'Securely update the JuanQuest Teacher account password and revoke all old tokens';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->option('email')));
        $teacher = User::where('role', 'teacher')
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        if (! $teacher) {
            $this->error("Walang nahanap na teacher account para sa email na: {$email}");

            return self::FAILURE;
        }

        $newPassword = (string) ($this->option('password') ?? '');
        if ($newPassword === '') {
            $newPassword = (string) $this->secret('Ilagay ang bagong password (min. 8 characters)');
            $confirm = (string) $this->secret('Ulitin ang bagong password');

            if ($newPassword !== $confirm) {
                $this->error('Hindi magkatugma ang dalawang password.');

                return self::FAILURE;
            }
        }

        if (mb_strlen($newPassword) < 8) {
            $this->error('Dapat hindi bababa sa 8 characters ang bagong password.');

            return self::FAILURE;
        }

        $teacher->update([
            'password' => Hash::make($newPassword),
        ]);

        // Revoke all old Sanctum tokens so anyone using the old password is immediately signed out
        $revoked = $teacher->tokens()->delete();

        $this->info("Matagumpay na napalitan ang password para sa {$teacher->email} ({$revoked} dating session ang na-logout).");

        return self::SUCCESS;
    }
}
