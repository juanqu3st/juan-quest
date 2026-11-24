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

    public function test_offline_pack_hashes_answers_and_hybrid_qr_result_import_ranks_with_online_groups(): void
    {
        $asToken = function (string $token) {
            $this->app['auth']->forgetGuards();

            return $this->withToken($token);
        };

        // 1) Public Offline Pack returns 5 maps + media_manifest + salted answer_hash, NEVER plain correct_answer
        $packRes = $this->getJson('/api/v1/offline/pack')
            ->assertOk()
            ->assertJsonCount(5, 'maps')
            ->assertJsonPath('max_total_score', 50);

        $rawPackJson = $packRes->getContent();
        $this->assertStringNotContainsString('"correct_answer"', $rawPackJson);
        $this->assertNotEmpty($packRes->json('pack_salt'));
        $this->assertArrayHasKey('videos', $packRes->json('media_manifest'));
        $this->assertArrayHasKey('images', $packRes->json('media_manifest'));
        $this->assertEquals('choice', $packRes->json('maps.0.challenges.0.answer_hash.mode'));
        $this->assertEquals('sequence', $packRes->json('maps.1.challenges.0.answer_hash.mode'));
        $this->assertEquals('matching', $packRes->json('maps.2.challenges.0.answer_hash.mode'));
        $this->assertEquals('word', $packRes->json('maps.3.challenges.0.answer_hash.mode'));
        $this->assertEquals('choice', $packRes->json('maps.4.challenges.0.answer_hash.mode'));

        // 2) Create a classroom group session and join 1 online device (Pangkat 1)
        $teacherToken = $this->postJson('/api/v1/auth/login', [
            'email' => 'teacher@juanquest.ph',
            'password' => 'password',
        ])->assertOk()->json('token');

        $lessonId = \App\Models\Lesson::value('id');
        $created = $asToken($teacherToken)
            ->postJson('/api/v1/teacher/sessions', [
                'class_name' => 'Grade 7 - Hybrid',
                'lesson_id' => $lessonId,
                'play_mode' => 'group',
                'join_code' => 'HYB7C',
            ])
            ->assertCreated();

        $sessionId = $created->json('session.id');

        $this->postJson('/api/v1/auth/join', [
            'join_code' => 'HYB7C',
            'full_name' => 'Online Leader',
        ])->assertOk();

        // Lobby & Monitor both expose the Offline Join QR payload + deterministic session key
        $lobby = $asToken($teacherToken)
            ->getJson("/api/v1/teacher/sessions/{$sessionId}")
            ->assertOk()
            ->assertJsonPath('session.offline_join_qr.t', 'jqj1')
            ->assertJsonPath('session.offline_join_qr.c', 'HYB7C');

        $qrKey = $lobby->json('session.offline_join_qr.k');
        $this->assertNotEmpty($qrKey);

        $basePayload = [
            't' => 'jqr1',
            'c' => 'HYB7C',
            'm' => 'group',
            'g' => 'Offline Ninjas',
            'l' => 'Carlo Reyes',
            'mb' => 'Carlo, Mia, Leo',
            's' => [10, 8, 10, 8, 10],
            'h' => [3, 2, 3, 2, 3],
            'tm' => [45, 50, 40, 55, 30],
            'fr' => ['c', 'c', 'c', 'c', 'c'],
            'id' => 'jq_test_sub_001',
        ];
        $canonical = 'HYB7C|group|Offline Ninjas|Carlo Reyes|10,8,10,8,10|3,2,3,2,3|45,50,40,55,30|jq_test_sub_001';
        $validSig = substr(hash('sha256', "{$canonical}|{$qrKey}"), 0, 16);

        // 3) Reject tampered signature, wrong session PIN, out-of-bounds score, and unconfirmed manual result
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => array_merge($basePayload, ['sig' => 'deadbeef00000000']),
            ])
            ->assertStatus(422);

        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => array_merge($basePayload, ['c' => 'WRONG1', 'sig' => $validSig]),
            ])
            ->assertStatus(422);

        $tamperedScoresPayload = array_merge($basePayload, ['s' => [12, 8, 10, 8, 10]]);
        $tamperedCanonical = 'HYB7C|group|Offline Ninjas|Carlo Reyes|12,8,10,8,10|3,2,3,2,3|45,50,40,55,30|jq_test_sub_001';
        $tamperedScoresPayload['sig'] = substr(hash('sha256', "{$tamperedCanonical}|{$qrKey}"), 0, 16);
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => $tamperedScoresPayload,
            ])
            ->assertStatus(422);

        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => array_merge($basePayload, ['sig' => 'manual']),
                'allow_manual' => false,
            ])
            ->assertStatus(422);

        // 4) Accept valid signed QR -> imports alongside online group, ranks #1 (46/50), marks source='offline_qr'
        $importRes = $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => array_merge($basePayload, ['sig' => $validSig]),
            ])
            ->assertOk()
            ->assertJsonPath('imported.already_imported', false)
            ->assertJsonPath('imported.verified_qr', true)
            ->assertJsonPath('imported.entry_name', 'Offline Ninjas')
            ->assertJsonPath('imported.total_score', 46)
            ->assertJsonPath('imported.hearts_remaining', 13)
            ->assertJsonCount(2, 'monitor.per_group')
            ->assertJsonPath('monitor.per_group.0.group_name', 'Offline Ninjas')
            ->assertJsonPath('monitor.per_group.0.source', 'offline_qr')
            ->assertJsonPath('monitor.per_group.0.rank', 1)
            ->assertJsonPath('monitor.per_group.1.source', 'online');

        // 5) Re-scanning the same Result QR deduplicates cleanly without creating a 3rd group
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => array_merge($basePayload, ['sig' => $validSig]),
            ])
            ->assertOk()
            ->assertJsonPath('imported.already_imported', true)
            ->assertJsonCount(2, 'monitor.per_group');

        // 6) Teacher Unblock Code matches deterministic 6-char formula & att=2 retry updates existing group cleanly
        $expectedUnblock = strtoupper(substr(hash('sha256', "jq-unblock|HYB7C|{$qrKey}"), 0, 6));
        $this->assertEquals($expectedUnblock, $lobby->json('session.offline_unblock_code'));

        $retryPayload = array_merge($basePayload, [
            's' => [10, 10, 10, 10, 10],
            'h' => [3, 3, 3, 3, 3],
            'id' => 'jq_test_sub_002',
            'att' => 2,
        ]);
        $retryCanonical = 'HYB7C|group|Offline Ninjas|Carlo Reyes|10,10,10,10,10|3,3,3,3,3|45,50,40,55,30|jq_test_sub_002|att=2';
        $retryPayload['sig'] = substr(hash('sha256', "{$retryCanonical}|{$qrKey}"), 0, 16);

        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => $retryPayload,
            ])
            ->assertOk()
            ->assertJsonPath('imported.already_imported', false)
            ->assertJsonPath('imported.total_score', 50)
            ->assertJsonCount(2, 'monitor.per_group')
            ->assertJsonPath('monitor.per_group.0.total_score', 50)
            ->assertJsonPath('monitor.per_group.0.offline_attempt', 2);
    }

    public function test_teacher_can_delete_session_and_cleans_up_guest_students_and_caches(): void
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
                'class_name' => 'Grade 7 - Temp Test',
                'lesson_id' => $lessonId,
                'play_mode' => 'group',
                'join_code' => 'TMP99',
            ])
            ->assertCreated();

        $sessionId = $created->json('session.id');

        $join = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'TMP99',
            'full_name' => 'Temp Guest Leader',
        ])->assertOk();

        $guestId = $join->json('user.id');
        $this->assertDatabaseHas('users', ['id' => $guestId, 'name' => 'Temp Guest Leader']);

        $asToken($teacherToken)
            ->deleteJson("/api/v1/teacher/sessions/{$sessionId}")
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('deleted_id', $sessionId);

        $this->assertDatabaseMissing('game_sessions', ['id' => $sessionId]);
        $this->assertDatabaseMissing('session_groups', ['game_session_id' => $sessionId]);
        $this->assertDatabaseMissing('session_participants', ['game_session_id' => $sessionId]);
        $this->assertDatabaseMissing('users', ['id' => $guestId]);

        // PIN cache invalidated -> joining deleted PIN fails cleanly with 422
        $this->postJson('/api/v1/auth/join', [
            'join_code' => 'TMP99',
            'full_name' => 'Late Student',
        ])->assertStatus(422);
    }

    public function test_online_disconnect_shows_disconnected_in_monitor_and_failover_qr_merges_without_duplicate(): void
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
                'class_name' => 'Grade 7 - Failover Test',
                'lesson_id' => $lessonId,
                'play_mode' => 'group',
                'join_code' => 'FLV7D',
            ])
            ->assertCreated();

        $sessionId = $created->json('session.id');

        // Start session -> student joins online & receives offline_qr_key in world payload
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/status", ['status' => 'active'])
            ->assertOk();

        $join = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'FLV7D',
            'full_name' => 'Rico Dalisay',
        ])->assertOk();

        $studentToken = $join->json('token');
        $studentId = $join->json('user.id');

        $world = $asToken($studentToken)
            ->getJson('/api/v1/student/world')
            ->assertOk();
        $qrKey = $world->json('session.offline_qr_key');
        $this->assertNotEmpty($qrKey);

        // Simulate student losing Wi-Fi mid-game (last_seen_at > 60s ago, 0 maps completed yet)
        User::where('id', $studentId)->update([
            'activity_status' => 'in_game',
            'current_map_number' => 3,
            'last_seen_at' => now()->subSeconds(75),
        ]);
        Cache::forget("juanquest:session:{$sessionId}:monitor");

        // Teacher Live Monitor immediately flags Rico Dalisay's group as 'disconnected'
        $asToken($teacherToken)
            ->getJson("/api/v1/teacher/sessions/{$sessionId}/monitor")
            ->assertOk()
            ->assertJsonCount(1, 'monitor.per_group')
            ->assertJsonPath('monitor.per_group.0.connection_status', 'disconnected');

        // Student finishes Maps 3-5 offline and Teacher scans their signed failover Result QR
        $failoverPayload = [
            't' => 'jqr1',
            'c' => 'FLV7D',
            'm' => 'group',
            'g' => 'Pangkat 1',
            'l' => 'Rico Dalisay',
            'mb' => '',
            's' => [10, 8, 8, 10, 10],
            'h' => [3, 2, 2, 3, 3],
            'tm' => [30, 40, 50, 45, 35],
            'fr' => ['c', 'c', 'c', 'c', 'c'],
            'id' => 'jq_failover_001',
        ];
        $canonical = 'FLV7D|group|Pangkat 1|Rico Dalisay|10,8,8,10,10|3,2,2,3,3|30,40,50,45,35|jq_failover_001';
        $failoverPayload['sig'] = substr(hash('sha256', "{$canonical}|{$qrKey}"), 0, 16);

        // Imports cleanly by MERGING into Rico's existing online group (still 1 group total, zero duplicate!)
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/offline-import", [
                'qr_payload' => $failoverPayload,
            ])
            ->assertOk()
            ->assertJsonPath('imported.already_imported', false)
            ->assertJsonPath('imported.total_score', 46)
            ->assertJsonCount(1, 'monitor.per_group')
            ->assertJsonPath('monitor.per_group.0.total_score', 46)
            ->assertJsonPath('monitor.per_group.0.activity_status', 'completed')
            ->assertJsonPath('monitor.per_group.0.source', 'offline_qr')
            ->assertJsonPath('monitor.per_group.0.connection_status', 'offline_qr');
    }

    public function test_teacher_can_reset_single_map_or_full_progress_for_online_student_retake(): void
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
        $sessionId = $asToken($teacherToken)
            ->postJson('/api/v1/teacher/sessions', [
                'class_name' => 'Grade 7 - Retake',
                'lesson_id' => $lessonId,
                'play_mode' => 'group',
                'join_code' => 'RTK7E',
            ])
            ->assertCreated()
            ->json('session.id');

        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/status", ['status' => 'active'])
            ->assertOk();

        $join = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'RTK7E',
            'full_name' => 'Nina Torres',
        ])->assertOk();

        $studentToken = $join->json('token');
        $studentId = $join->json('user.id');

        $map1 = Map::where('map_number', 1)->firstOrFail();
        $map2 = Map::where('map_number', 2)->firstOrFail();

        // Timeout Mapa 1 (2 pts) and Mapa 2 (2 pts) -> both locked non-replayable
        $asToken($studentToken)->postJson("/api/v1/student/maps/{$map1->id}/start")->assertOk();
        $asToken($studentToken)->postJson("/api/v1/student/maps/{$map1->id}/timeout")->assertOk();
        $asToken($studentToken)->postJson("/api/v1/student/maps/{$map2->id}/start")->assertOk();
        $asToken($studentToken)->postJson("/api/v1/student/maps/{$map2->id}/timeout")->assertOk();

        $asToken($studentToken)->postJson("/api/v1/student/maps/{$map1->id}/start")->assertStatus(422);

        // 1) Teacher resets ONLY Mapa 1 -> Mapa 1 becomes replayable while Mapa 2 keeps its 2 pts!
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/participants/{$studentId}/reset", [
                'map_number' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('reset_map_number', 1)
            ->assertJsonPath('monitor.per_group.0.total_score', 2)
            ->assertJsonPath('monitor.per_group.0.map_scores.1', null)
            ->assertJsonPath('monitor.per_group.0.map_scores.2', 2);

        $asToken($studentToken)->postJson("/api/v1/student/maps/{$map1->id}/start")->assertOk();

        // 2) Teacher resets FULL game (map_number = null) -> score becomes 0 and current_map_number resets to 1
        $asToken($teacherToken)
            ->postJson("/api/v1/teacher/sessions/{$sessionId}/participants/{$studentId}/reset", [
                'map_number' => null,
            ])
            ->assertOk()
            ->assertJsonPath('monitor.per_group.0.total_score', 0)
            ->assertJsonPath('monitor.per_group.0.current_map_number', 1);
    }

    public function test_security_hardening_role_guard_csv_formula_sanitization_and_teacher_password_command(): void
    {
        $asToken = function (string $token) {
            $this->app['auth']->forgetGuards();

            return $this->withToken($token);
        };

        // 1) Student cannot access Teacher endpoints (403 Forbidden)
        $studentJoin = $this->postJson('/api/v1/auth/join', [
            'join_code' => 'JUAN7A',
            'full_name' => '=SUM(1,2)',
        ])->assertOk();

        $studentToken = $studentJoin->json('token');
        $asToken($studentToken)
            ->getJson('/api/v1/teacher/sessions')
            ->assertStatus(403);

        // 2) Export CSV neutralizes Excel/Sheets formula injection ('=SUM(1,2))
        $teacherToken = $this->postJson('/api/v1/auth/login', [
            'email' => 'teacher@juanquest.ph',
            'password' => 'password',
        ])->assertOk()->json('token');

        $sessionId = GameSession::where('join_code', 'JUAN7A')->value('id');
        $csvRes = $asToken($teacherToken)
            ->get("/api/v1/teacher/sessions/{$sessionId}/export")
            ->assertOk();

        $csvBody = $csvRes->streamedContent();
        $this->assertStringContainsString("'=SUM(1,2)", $csvBody);

        // 3) Artisan teacher-password command updates password & revokes old tokens
        $this->artisan('juanquest:teacher-password', [
            '--email' => 'teacher@juanquest.ph',
            '--password' => 'StrongPass2026!',
        ])->assertSuccessful();

        $this->postJson('/api/v1/auth/login', [
            'email' => 'teacher@juanquest.ph',
            'password' => 'password',
        ])->assertStatus(422);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'teacher@juanquest.ph',
            'password' => 'StrongPass2026!',
        ])->assertOk();
    }
}
