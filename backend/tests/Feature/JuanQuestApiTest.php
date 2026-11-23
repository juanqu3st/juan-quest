<?php

namespace Tests\Feature;

use App\Models\Challenge;
use App\Models\GameSession;
use App\Models\Map;
use App\Models\User;
use Database\Seeders\JuanOsongSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class JuanQuestApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(JuanOsongSeeder::class);
    }

    public function test_student_joins_by_pin_and_full_name_and_world_hides_correct_answers(): void
    {
        $join = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'juan7a',
            'full_name' => 'Pedro Penduko',
        ])->assertOk();

        $token = $join->json('token');
        $this->assertNotEmpty($token);

        $world = $this->withToken($token)
            ->getJson('/api/v1/student/world')
            ->assertOk()
            ->assertJsonCount(5, 'maps')
            ->assertJsonPath('max_total_score', 50);

        $firstChallenge = $world->json('maps.0.challenges.0');
        $this->assertArrayNotHasKey('correct_answer', $firstChallenge);
        $this->assertFalse($world->json('maps.0.allow_user_time_choice'));
        $this->assertEquals(10, $world->json('maps.0.perfect_score'));
        $this->assertTrue(Cache::has('juanquest:lesson:1:world'));
    }

    public function test_per_item_ten_point_scoring_with_heart_lifeline_and_zero_heart_auto_advance(): void
    {
        $join = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'JUAN7A',
            'full_name' => 'Maria Makiling',
        ])->assertOk();

        $token = $join->json('token');
        $map1 = Map::where('map_number', 1)->firstOrFail();
        $map1->update(['time_limit_seconds' => 90]);
        $challenges = $map1->challenges()->orderBy('order_index')->get();

        // Teacher timer enforced; starts at 0/10 earned pts with 3 lifeline hearts
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/start", ['chosen_time_limit' => 30])
            ->assertOk()
            ->assertJsonPath('progress.hearts_remaining', 3)
            ->assertJsonPath('progress.time_limit_used', 90)
            ->assertJsonPath('projected_score', 0)
            ->assertJsonPath('max_score', 10);

        // Sync elapsed time persists remaining_seconds for reload/reopen resume
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/sync", ['elapsed_seconds' => 15])
            ->assertOk()
            ->assertJsonPath('progress.time_taken_seconds', 15)
            ->assertJsonPath('progress.remaining_seconds', 75);

        // Answer Q1, Q2, Q3 correctly -> +1 pt each = 3 pts earned
        foreach (['B', 'C', 'B'] as $i => $choice) {
            $this->withToken($token)
                ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                    'challenge_id' => $challenges[$i]->id,
                    'submission' => ['choice' => $choice],
                    'elapsed_seconds' => 16 + $i,
                ])
                ->assertOk()
                ->assertJsonPath('is_correct', true)
                ->assertJsonPath('projected_score', $i + 1)
                ->assertJsonPath('hearts_remaining', 3);
        }

        // Q4 wrong (correct is D) -> prompts Heart Lifeline modal without deducting heart yet
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                'challenge_id' => $challenges[3]->id,
                'submission' => ['choice' => 'A'],
                'elapsed_seconds' => 22,
            ])
            ->assertOk()
            ->assertJsonPath('is_correct', false)
            ->assertJsonPath('awaiting_lifeline', true)
            ->assertJsonPath('hearts_remaining', 3)
            ->assertJsonPath('level_ended', false);

        // Cannot submit another question while lifeline choice is pending (anti-cheat)
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                'challenge_id' => $challenges[4]->id,
                'submission' => ['choice' => 'C'],
                'elapsed_seconds' => 23,
            ])
            ->assertStatus(422);

        // Use 1 heart -> hearts drop 3 -> 2, can retry Q4 and earn its point
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/lifeline", ['action' => 'use_heart'])
            ->assertOk()
            ->assertJsonPath('hearts_remaining', 2)
            ->assertJsonPath('lifeline_action', 'use_heart');

        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                'challenge_id' => $challenges[3]->id,
                'submission' => ['choice' => 'D'],
                'elapsed_seconds' => 25,
            ])
            ->assertOk()
            ->assertJsonPath('is_correct', true)
            ->assertJsonPath('projected_score', 4)
            ->assertJsonPath('hearts_remaining', 2);

        // Q5 wrong (correct is C) -> choose SKIP (save hearts, 0 pts for Q5, proceed to Q6)
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                'challenge_id' => $challenges[4]->id,
                'submission' => ['choice' => 'A'],
                'elapsed_seconds' => 28,
            ])
            ->assertOk()
            ->assertJsonPath('awaiting_lifeline', true);

        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/lifeline", ['action' => 'skip'])
            ->assertOk()
            ->assertJsonPath('hearts_remaining', 2)
            ->assertJsonPath('projected_score', 4)
            ->assertJsonCount(1, 'failed_challenge_ids');

        // Spend last 2 hearts on Q6, then get Q6 wrong at 0 hearts -> auto 0 pts & auto-advance (no modal!)
        for ($retry = 0; $retry < 2; $retry++) {
            $this->withToken($token)
                ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                    'challenge_id' => $challenges[5]->id,
                    'submission' => ['choice' => 'A'],
                    'elapsed_seconds' => 30 + $retry,
                ])
                ->assertOk()
                ->assertJsonPath('awaiting_lifeline', true);

            $this->withToken($token)
                ->postJson("/api/v1/student/maps/{$map1->id}/lifeline", ['action' => 'use_heart'])
                ->assertOk()
                ->assertJsonPath('hearts_remaining', 1 - $retry);
        }

        // Now at 0 hearts: wrong on Q6 auto-marks 0 pts (failed) without lifeline modal
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                'challenge_id' => $challenges[5]->id,
                'submission' => ['choice' => 'A'],
                'elapsed_seconds' => 35,
            ])
            ->assertOk()
            ->assertJsonPath('awaiting_lifeline', false)
            ->assertJsonPath('hearts_remaining', 0)
            ->assertJsonPath('projected_score', 4)
            ->assertJsonPath('level_ended', false)
            ->assertJsonCount(2, 'failed_challenge_ids');

        // Answer Q7..Q10 correctly (B, C, A, B) -> ends map with exact 8/10 (NOT 10/10!) & unlocks Mapa 2
        foreach ([6 => 'B', 7 => 'C', 8 => 'A', 9 => 'B'] as $idx => $choice) {
            $res = $this->withToken($token)
                ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                    'challenge_id' => $challenges[$idx]->id,
                    'submission' => ['choice' => $choice],
                    'elapsed_seconds' => 36 + $idx,
                ])
                ->assertOk();

            if ($idx === 9) {
                $res->assertJsonPath('level_ended', true)
                    ->assertJsonPath('final_score', 8)
                    ->assertJsonPath('hearts_remaining', 0)
                    ->assertJsonPath('current_map_number', 2);
            }
        }

        // Completed map is non-replayable
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/start")
            ->assertStatus(422);

        // Whole-board map (Mapa 2 Sequencing): partial 6/10 -> prompts lifeline -> skip finalizes 6/10 keeping 3 hearts
        $map2 = Map::where('map_number', 2)->firstOrFail();
        $seqChallenge = $map2->challenges()->firstOrFail();

        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map2->id}/start")
            ->assertOk();

        // Correct order is [2, 4, 3, 1, 5]; swap last two -> 3 of 5 exact positions = 6 pts
        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map2->id}/submit", [
                'challenge_id' => $seqChallenge->id,
                'submission' => ['order' => [2, 4, 3, 5, 1]],
                'elapsed_seconds' => 20,
            ])
            ->assertOk()
            ->assertJsonPath('awaiting_lifeline', true)
            ->assertJsonPath('pending_lifeline.attempt_earned', 6)
            ->assertJsonPath('hearts_remaining', 3);

        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map2->id}/lifeline", ['action' => 'skip'])
            ->assertOk()
            ->assertJsonPath('level_ended', true)
            ->assertJsonPath('final_score', 6)
            ->assertJsonPath('hearts_remaining', 3)
            ->assertJsonPath('current_map_number', 3);
    }

    public function test_timeout_awards_two_point_floor_when_zero_earned_and_unlocks_next_map(): void
    {
        $join = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'JUAN7A',
            'full_name' => 'Lapu Lapu',
        ])->assertOk();

        $token = $join->json('token');
        $map1 = Map::where('map_number', 1)->firstOrFail();

        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/start")
            ->assertOk();

        $this->withToken($token)
            ->postJson("/api/v1/student/maps/{$map1->id}/timeout")
            ->assertOk()
            ->assertJsonPath('level_ended', true)
            ->assertJsonPath('finish_reason', 'timeout')
            ->assertJsonPath('hearts_remaining', 0)
            ->assertJsonPath('final_score', 2)
            ->assertJsonPath('current_map_number', 2);
    }

    public function test_group_mode_auto_assigns_one_group_per_device_with_member_roster_and_waiting_gate(): void
    {
        $asToken = function (string $token) {
            $this->app['auth']->forgetGuards();

            return $this->withToken($token);
        };

        $teacherToken = $this->postJson('/api/v1/auth/login', [
            'email' => 'teacher@juanquest.ph',
            'password' => 'password',
        ])->assertOk()->json('token');

        $lessonId = \App\Models\Lesson::value('id');
        $map1 = Map::where('map_number', 1)->firstOrFail();

        // 1. Newly created group session defaults to waiting + group mode
        $created = $asToken($teacherToken)
            ->postJson('/api/v1/teacher/sessions', [
                'class_name' => 'Grade 7 - Rizztan',
                'lesson_id' => $lessonId,
                'play_mode' => 'group',
                'join_code' => 'GRP7A',
            ])
            ->assertCreated()
            ->assertJsonPath('session.status', 'waiting')
            ->assertJsonPath('session.play_mode', 'group');

        $sessionId = $created->json('session.id');

        // 2. Two devices join -> automatically assigned Pangkat 1 and Pangkat 2 (1 device = 1 group)
        $team1Token = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'GRP7A',
            'full_name' => 'Ana Santos',
        ])->assertOk()->json('token');

        $team2Token = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'GRP7A',
            'full_name' => 'Ben Cruz',
        ])->assertOk()->json('token');

        $world1 = $asToken($team1Token)
            ->getJson('/api/v1/student/world')
            ->assertOk()
            ->assertJsonPath('session.play_mode', 'group')
            ->assertJsonPath('session.status', 'waiting')
            ->assertJsonPath('session.group_name', 'Pangkat 1')
            ->assertJsonPath('session.can_rename_group', true);

        $group1Id = $world1->json('session.group_id');
        $this->assertNotEmpty($group1Id);

        $asToken($team2Token)
            ->getJson('/api/v1/student/world')
            ->assertOk()
            ->assertJsonPath('session.group_name', 'Pangkat 2');

        // 3. Starting Mapa 1 while waiting is blocked server-side (422)
        $asToken($team1Token)
            ->postJson("/api/v1/student/maps/{$map1->id}/start")
            ->assertStatus(422);

        // 4. Team 1 renames their Pangkat to RIZZTAN and lists member names while waiting
        $asToken($team1Token)
            ->patchJson('/api/v1/student/group-name', [
                'group_name' => '  RIZZTAN  ',
                'member_names' => 'Ana Santos, Carl Reyes, Dan Lim, Eva Go',
            ])
            ->assertOk()
            ->assertJsonPath('group_name', 'RIZZTAN')
            ->assertJsonPath('member_names', 'Ana Santos, Carl Reyes, Dan Lim, Eva Go');

        // Teacher Monitor immediately sees RIZZTAN + member roster (cache invalidated)
        $monitor = $asToken($teacherToken)
            ->getJson("/api/v1/teacher/sessions/{$sessionId}/monitor")
            ->assertOk()
            ->assertJsonPath('monitor.session.play_mode', 'group')
            ->assertJsonCount(2, 'monitor.per_group');

        $groupNames = collect($monitor->json('monitor.per_group'))->pluck('group_name')->all();
        $this->assertContains('RIZZTAN', $groupNames);
        $rizztanRow = collect($monitor->json('monitor.per_group'))->firstWhere('group_name', 'RIZZTAN');
        $this->assertEquals('Ana Santos, Carl Reyes, Dan Lim, Eva Go', $rizztanRow['member_names']);

        // 5. Locking room blocks brand-new joiners while letting existing devices reconnect
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/lock")
            ->assertOk()
            ->assertJsonPath('session.groups_locked', true);

        $this->postJson('/api/v1/auth/join', [
            'join_code' => 'GRP7A',
            'full_name' => 'Late Joiner',
        ])->assertStatus(422);

        $this->postJson('/api/v1/auth/join', [
            'join_code' => 'GRP7A',
            'full_name' => 'Ana Santos',
        ])->assertOk();

        // 6. Teacher starts game (Active) -> student rename locks, gameplay unlocks
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/status", ['status' => 'active'])
            ->assertOk()
            ->assertJsonPath('session.status', 'active');

        $asToken($team1Token)
            ->getJson('/api/v1/student/world')
            ->assertOk()
            ->assertJsonPath('session.can_rename_group', false);

        $asToken($team1Token)
            ->patchJson('/api/v1/student/group-name', [
                'group_name' => 'NEWNAME',
            ])
            ->assertStatus(422);

        // Teacher can still moderate group name & member roster while Active
        $asToken($teacherToken)
            ->patchJson("/api/v1/teacher/groups/{$group1Id}", [
                'group_name' => 'RIZZTAN 7A',
                'member_names' => 'Ana, Carl, Dan, Eva',
            ])
            ->assertOk()
            ->assertJsonPath('group.group_name', 'RIZZTAN 7A')
            ->assertJsonPath('group.member_names', 'Ana, Carl, Dan, Eva');

        // Gameplay succeeds while Active
        $asToken($team1Token)
            ->postJson("/api/v1/student/maps/{$map1->id}/start")
            ->assertOk();

        // 7. Finished session blocks further submissions
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/status", ['status' => 'finished'])
            ->assertOk();

        $firstChallenge = $map1->challenges()->orderBy('order_index')->firstOrFail();
        $asToken($team1Token)
            ->postJson("/api/v1/student/maps/{$map1->id}/submit", [
                'challenge_id' => $firstChallenge->id,
                'submission' => ['choice' => 'B'],
                'elapsed_seconds' => 10,
            ])
            ->assertStatus(422);
    }

    public function test_individual_mode_has_no_groups_blocks_group_rename_and_ranks_solo(): void
    {
        $asToken = function (string $token) {
            $this->app['auth']->forgetGuards();

            return $this->withToken($token);
        };

        $teacherToken = $this->postJson('/api/v1/auth/login', [
            'email' => 'teacher@juanquest.ph',
            'password' => 'password',
        ])->assertOk()->json('token');

        $lessonId = \App\Models\Lesson::value('id');

        $created = $asToken($teacherToken)
            ->postJson('/api/v1/teacher/sessions', [
                'class_name' => 'Grade 7 - Solo Quiz',
                'lesson_id' => $lessonId,
                'play_mode' => 'individual',
                'join_code' => 'IND7B',
            ])
            ->assertCreated()
            ->assertJsonPath('session.play_mode', 'individual')
            ->assertJsonPath('session.status', 'waiting');

        $sessionId = $created->json('session.id');

        $soloToken = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'IND7B',
            'full_name' => 'Liza Cruz',
        ])->assertOk()->json('token');

        // Individual mode has no group and cannot rename group
        $asToken($soloToken)
            ->getJson('/api/v1/student/world')
            ->assertOk()
            ->assertJsonPath('session.play_mode', 'individual')
            ->assertJsonPath('session.group_id', null)
            ->assertJsonPath('session.group_name', null)
            ->assertJsonPath('session.can_rename_group', false)
            ->assertJsonPath('leaderboard.play_mode', 'individual')
            ->assertJsonCount(0, 'leaderboard.groups')
            ->assertJsonCount(1, 'leaderboard.individuals');

        $asToken($soloToken)
            ->patchJson('/api/v1/student/group-name', [
                'group_name' => 'SHOULD FAIL',
            ])
            ->assertStatus(422);

        // Teacher Monitor returns individual rows only (no groups)
        $asToken($teacherToken)
            ->getJson("/api/v1/teacher/sessions/{$sessionId}/monitor")
            ->assertOk()
            ->assertJsonPath('monitor.session.play_mode', 'individual')
            ->assertJsonCount(0, 'monitor.per_group')
            ->assertJsonCount(1, 'monitor.individual')
            ->assertJsonPath('monitor.individual.0.name', 'Liza Cruz');
    }

    public function test_health_endpoint_and_cloudinary_auto_delete_on_cms_remove_and_destroy(): void
    {
        // 1) BetterStack / Render lightweight health check
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('service', 'juanquest-api');

        // 2) Configure Cloudinary credentials in config (config:cache safe!) and fake Cloudinary Destroy API
        config([
            'services.cloudinary.driver' => 'cloudinary',
            'services.cloudinary.cloud_name' => 'demo-cloud',
            'services.cloudinary.api_key' => 'test-key-123',
            'services.cloudinary.api_secret' => 'test-secret-456',
        ]);

        Http::fake([
            'https://api.cloudinary.com/v1_1/demo-cloud/image/destroy' => Http::response(['result' => 'ok'], 200),
        ]);

        $teacher = User::where('role', 'teacher')->firstOrFail();
        Sanctum::actingAs($teacher);

        // Removing a single challenge image during update triggers Cloudinary destroy
        $map1 = Map::where('map_number', 1)->firstOrFail();
        $singleChallenge = Challenge::create([
            'map_id' => $map1->id,
            'order_index' => 99,
            'payload' => [
                'question' => 'Cloudinary image removal test?',
                'choices' => ['A' => 'Isa', 'B' => 'Dalawa', 'C' => 'Tatlo', 'D' => 'Apat'],
                'image' => 'https://res.cloudinary.com/demo-cloud/image/upload/v1732000000/juanquest/challenges/remove_me.jpg',
            ],
            'correct_answer' => ['choice' => 'A'],
        ]);

        $this->postJson("/api/v1/teacher/cms/challenges/{$singleChallenge->id}", [
            'order_index' => 99,
            'payload' => [
                'question' => 'Cloudinary image removal test?',
                'choices' => ['A' => 'Isa', 'B' => 'Dalawa', 'C' => 'Tatlo', 'D' => 'Apat'],
                'image' => '',
            ],
            'correct_answer' => ['choice' => 'A'],
        ])->assertOk()->assertJsonPath('challenge.payload.image', null);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.cloudinary.com/v1_1/demo-cloud/image/destroy'
                && ($request['public_id'] ?? null) === 'juanquest/challenges/remove_me'
                && ($request['invalidate'] ?? null) === 'true'
                && ! empty($request['signature']);
        });

        // Deleting a 4-pics challenge triggers Cloudinary destroy for every attached image
        $map4 = Map::where('map_number', 4)->firstOrFail();
        $fourPicsChallenge = Challenge::create([
            'map_id' => $map4->id,
            'order_index' => 99,
            'payload' => [
                'clue' => 'Test clue',
                'images' => [
                    'https://res.cloudinary.com/demo-cloud/image/upload/v1732000001/juanquest/challenges/pic_a.jpg',
                    'https://res.cloudinary.com/demo-cloud/image/upload/v1732000002/juanquest/challenges/pic_b.png',
                    null,
                    null,
                ],
            ],
            'correct_answer' => ['word' => 'PINTO'],
        ]);

        $this->deleteJson("/api/v1/teacher/cms/challenges/{$fourPicsChallenge->id}")
            ->assertOk()
            ->assertJsonPath('ok', true);

        Http::assertSent(fn ($req) => ($req['public_id'] ?? null) === 'juanquest/challenges/pic_a');
        Http::assertSent(fn ($req) => ($req['public_id'] ?? null) === 'juanquest/challenges/pic_b');
    }
}
