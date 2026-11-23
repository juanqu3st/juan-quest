<?php

namespace Database\Seeders;

use App\Models\Challenge;
use App\Models\GameSession;
use App\Models\Lesson;
use App\Models\Map;
use App\Models\SessionGroup;
use App\Models\SessionParticipant;
use App\Models\StudentProgress;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class JuanOsongSeeder extends Seeder
{
    public function run(): void
    {
        $teacher = User::updateOrCreate(
            ['email' => 'teacher@juanquest.ph'],
            [
                'name' => 'Bb. Maria Clara Reyes',
                'password' => Hash::make('password'),
                'role' => 'teacher',
                'section' => 'Grade 7 Faculty',
                'selected_character' => 'juan',
                'current_map_number' => 1,
                'activity_status' => 'idle',
                'last_seen_at' => now(),
            ]
        );

        $lesson = Lesson::updateOrCreate(
            ['title' => 'Kuwentong-Bayang Si Juan Osong'],
            [
                'description' => 'Interaktibong 3D E-SIM para sa Grade 7 Filipino: Pagsusuri sa kuwentong-bayan na "Si Juan Osong" gamit ang limang antas ng pagkatuto.',
                'video_source_type' => 'placeholder',
                'youtube_url' => null,
                'youtube_video_id' => null,
                'uploaded_video_path' => null,
                'is_active' => true,
            ]
        );

        $mapsData = $this->getMapsDefinition();
        $maps = [];

        foreach ($mapsData as $mapEntry) {
            $challenges = $mapEntry['challenges'];
            unset($mapEntry['challenges']);

            $map = Map::updateOrCreate(
                [
                    'lesson_id' => $lesson->id,
                    'map_number' => $mapEntry['map_number'],
                ],
                array_merge($mapEntry, ['lesson_id' => $lesson->id])
            );

            $map->challenges()->delete();
            foreach ($challenges as $challenge) {
                Challenge::create([
                    'map_id' => $map->id,
                    'order_index' => $challenge['order_index'],
                    'payload' => $challenge['payload'],
                    'correct_answer' => $challenge['correct_answer'],
                ]);
            }

            $maps[$map->map_number] = $map;
        }

        // 1. Sample Group Mode Session (1 Device = 1 Pangkat)
        $groupSession = GameSession::updateOrCreate(
            ['join_code' => 'JUAN7A'],
            [
                'teacher_id' => $teacher->id,
                'lesson_id' => $lesson->id,
                'class_name' => 'Grade 7 - Rizal (Per Grupo)',
                'play_mode' => 'group',
                'members_per_group' => 1,
                'groups_locked' => false,
                'status' => 'active',
            ]
        );

        $sampleTeams = [
            [
                'group_number' => 1,
                'group_name' => 'Pangkat 1',
                'leader' => 'Andres Bonifacio Jr.',
                'members' => 'Andres Bonifacio Jr., Liza Soberano, Carlo Aquino, Bea Alonzo, Miguel Tanfelix',
                'char' => 'juan',
                'map' => 5,
                'status' => 'completed',
                'scores' => [10, 10, 8, 10, 10],
            ],
            [
                'group_number' => 2,
                'group_name' => 'Pangkat 2',
                'leader' => 'Kathryn Bernardo',
                'members' => 'Kathryn Bernardo, Daniel Padilla, Nadine Lustre, James Reid, Enrique Gil',
                'char' => 'pedro',
                'map' => 5,
                'status' => 'completed',
                'scores' => [10, 10, 10, 8, 8],
            ],
            [
                'group_number' => 3,
                'group_name' => 'Pangkat 3',
                'leader' => 'Bianca Umali',
                'members' => 'Bianca Umali, Ruru Madrid, Kyline Alcantara, Joshua Garcia, Barbie Forteza',
                'char' => 'pedro',
                'map' => 4,
                'status' => 'in_game',
                'scores' => [10, 8, 8],
            ],
        ];

        foreach ($sampleTeams as $index => $team) {
            $num = $index + 1;
            $group = SessionGroup::updateOrCreate(
                [
                    'game_session_id' => $groupSession->id,
                    'group_number' => $team['group_number'],
                ],
                [
                    'group_name' => $team['group_name'],
                    'member_names' => $team['members'],
                ]
            );

            $leader = User::updateOrCreate(
                ['email' => "team{$num}@juanquest.ph"],
                [
                    'name' => $team['leader'],
                    'password' => Hash::make('password'),
                    'role' => 'student',
                    'section' => 'Grade 7 - Rizal',
                    'selected_character' => $team['char'],
                    'current_map_number' => $team['map'],
                    'activity_status' => $team['status'],
                    'last_seen_at' => now()->subSeconds($index * 7),
                ]
            );

            SessionParticipant::updateOrCreate(
                [
                    'game_session_id' => $groupSession->id,
                    'user_id' => $leader->id,
                ],
                [
                    'session_group_id' => $group->id,
                    'joined_at' => now()->subMinutes(20 - $index),
                ]
            );

            foreach ($team['scores'] as $mapIdx => $score) {
                $mapNumber = $mapIdx + 1;
                $mistakes = max(0, min(3, (int) floor((10 - $score) / 2)));
                $hearts = 3 - $mistakes;
                $timeUsed = 60;
                $timeTaken = min($timeUsed, 20 + ($num * 3) + ($mapNumber * 2));

                StudentProgress::updateOrCreate(
                    [
                        'user_id' => $leader->id,
                        'map_id' => $maps[$mapNumber]->id,
                    ],
                    [
                        'game_session_id' => $groupSession->id,
                        'score' => $score,
                        'mistakes_count' => $mistakes,
                        'hearts_remaining' => $hearts,
                        'time_limit_used' => $timeUsed,
                        'time_taken_seconds' => $timeTaken,
                        'attempts' => 1,
                        'is_completed' => true,
                        'answers_log' => ['seeded' => true],
                        'completed_at' => now()->subMinutes(15 - $mapNumber),
                    ]
                );
            }
        }

        // 2. Sample Individual Mode Session (Solo Play, Walang Grupo)
        $soloSession = GameSession::updateOrCreate(
            ['join_code' => 'SOLO7B'],
            [
                'teacher_id' => $teacher->id,
                'lesson_id' => $lesson->id,
                'class_name' => 'Grade 7 - Bonifacio (Indibidwal)',
                'play_mode' => 'individual',
                'members_per_group' => 1,
                'groups_locked' => false,
                'status' => 'active',
            ]
        );

        $sampleSoloStudents = [
            ['name' => 'Maria Clara', 'char' => 'pedro', 'map' => 5, 'status' => 'completed', 'scores' => [10, 10, 10, 10, 10]],
            ['name' => 'Crisostomo Ibarra', 'char' => 'juan', 'map' => 5, 'status' => 'completed', 'scores' => [10, 8, 10, 8, 10]],
            ['name' => 'Elias Dimas', 'char' => 'juan', 'map' => 4, 'status' => 'in_game', 'scores' => [8, 8, 8]],
        ];

        foreach ($sampleSoloStudents as $index => $entry) {
            $num = $index + 1;
            $soloStudent = User::updateOrCreate(
                ['email' => "solo{$num}@juanquest.ph"],
                [
                    'name' => $entry['name'],
                    'password' => Hash::make('password'),
                    'role' => 'student',
                    'section' => 'Grade 7 - Bonifacio',
                    'selected_character' => $entry['char'],
                    'current_map_number' => $entry['map'],
                    'activity_status' => $entry['status'],
                    'last_seen_at' => now()->subSeconds($index * 9),
                ]
            );

            SessionParticipant::updateOrCreate(
                [
                    'game_session_id' => $soloSession->id,
                    'user_id' => $soloStudent->id,
                ],
                [
                    'session_group_id' => null,
                    'joined_at' => now()->subMinutes(15 - $index),
                ]
            );

            foreach ($entry['scores'] as $mapIdx => $score) {
                $mapNumber = $mapIdx + 1;
                $mistakes = max(0, min(3, (int) floor((10 - $score) / 2)));
                $hearts = 3 - $mistakes;
                $timeUsed = 60;
                $timeTaken = min($timeUsed, 18 + ($num * 2) + ($mapNumber * 3));

                StudentProgress::updateOrCreate(
                    [
                        'user_id' => $soloStudent->id,
                        'map_id' => $maps[$mapNumber]->id,
                    ],
                    [
                        'game_session_id' => $soloSession->id,
                        'score' => $score,
                        'mistakes_count' => $mistakes,
                        'hearts_remaining' => $hearts,
                        'time_limit_used' => $timeUsed,
                        'time_taken_seconds' => $timeTaken,
                        'attempts' => 1,
                        'is_completed' => true,
                        'answers_log' => ['seeded' => true],
                        'completed_at' => now()->subMinutes(12 - $mapNumber),
                    ]
                );
            }
        }
    }

    private function getMapsDefinition(): array
    {
        return [
            [
                'map_number' => 1,
                'title' => 'Ang Curfew',
                'strategy_type' => 'multiple_choice',
                'strategy_label' => 'Piliin ang Tamang Sagot',
                'pokus_na_kasanayan' => 'Pagtukoy sa mga elemento ng kuwento at pag-unawa sa mahahalagang detalye.',
                'panuto' => 'Pagkatapos panoorin ang unang bahagi ng kuwento, basahin nang mabuti ang bawat tanong at piliin ang titik ng tamang sagot.',
                'youtube_start_sec' => 0,
                'youtube_end_sec' => 50,
                'story_video_path' => 'videos/mapa1_curfew.mp4',
                'voiceover_mode' => 'default',
                'whole_voiceover_path' => null,
                'max_hearts' => 3,
                'perfect_score' => 10,
                'min_floor_score' => 2,
                'time_limit_seconds' => 60,
                'allow_user_time_choice' => false,
                'feedback_correct' => 'Mahusay! Naunawaan mo ang mahahalagang elemento at pangyayari sa unang bahagi ng kuwento.',
                'feedback_wrong' => 'Subukan muli! Balikan ang napanood na eksena at suriin ang mga detalye ng kuwento.',
                'scene_script' => [
                    [
                        'scene_title' => 'Scene 1: Ang Bagong Ordinansa',
                        'timestamp' => '0:00–0:17',
                        'start_sec' => 0,
                        'end_sec' => 17,
                        'visual_guide' => 'Alkalde at mensahero ng bayan na naghahatid ng ordinansa sa kalsada ng bayan pagsapit ng takipsilim.',
                        'dialogue' => 'Narrator: "Si Juan Osong. May utos ang alkalde sa mensahero ng bayan kung saan nakatira si Juan Osong na ipabatid sa mga mamamayan ang bagong ordinansa na nagbabawal na maglakad sa kalsada pagsapit ng alas-diyes ng gabi."',
                    ],
                    [
                        'scene_title' => 'Scene 2: Ang Kakaibang Paraan ni Juan',
                        'timestamp' => '0:17–0:29',
                        'start_sec' => 17,
                        'end_sec' => 29,
                        'visual_guide' => 'Si Juan na nasa lansangan pagsapit ng alas-diyes ng gabi at gumapang sa halip na maglakad.',
                        'dialogue' => 'Narrator: "Dahil nasa lansangan pa si Juan Osong nang sumapit ang alas-diyes, ipinasya niyang gumapang."',
                    ],
                    [
                        'scene_title' => 'Scene 3: Ang Pagtatanong ng Pulis',
                        'timestamp' => '0:29–0:50',
                        'start_sec' => 29,
                        'end_sec' => 50,
                        'visual_guide' => 'Pulis na may dalang ilawan na nakakita kay Juan sa gitna ng kalsada.',
                        'dialogue' => 'Pulis: "Bakit narito ka pa? Hindi mo ba alam na bawal sa taong bayan ang maglakad sa kalye pagkatapos ng alas-diyes ng gabi?" | Juan: "Opo, alam ko po. Pero nakikita naman ninyo, hindi po ako naglalakad. Ako po ay gumagapang."',
                    ],
                ],
                'challenges' => [
                    [
                        'order_index' => 1,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_ordinance.jpg',
                            'question' => 'Sino ang pangunahing tauhan sa kuwentong-bayan?',
                            'choices' => ['A' => 'Pedro', 'B' => 'Juan Osong', 'C' => 'Ang alkalde', 'D' => 'Ang pulis'],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                    [
                        'order_index' => 2,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_ordinance.jpg',
                            'question' => 'Sino ang nag-utos na ipabatid sa mga mamamayan ang bagong ordinansa?',
                            'choices' => ['A' => 'Ang pulis', 'B' => 'Ang mensahero', 'C' => 'Ang alkalde', 'D' => 'Ang guwardiya'],
                        ],
                        'correct_answer' => ['choice' => 'C'],
                    ],
                    [
                        'order_index' => 3,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_ordinance.jpg',
                            'question' => 'Ano ang ipinagbabawal ng bagong ordinansa?',
                            'choices' => [
                                'A' => 'Paglabas ng bahay sa umaga',
                                'B' => 'Paglalakad sa kalsada pagsapit ng alas-diyes ng gabi',
                                'C' => 'Pagpunta sa palengke',
                                'D' => 'Paggapang sa lansangan',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                    [
                        'order_index' => 4,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_ordinance.jpg',
                            'question' => 'Anong oras ipinagbabawal ang paglalakad sa kalsada?',
                            'choices' => ['A' => 'Alas-sais ng gabi', 'B' => 'Alas-otso ng gabi', 'C' => 'Alas-nuwebe ng gabi', 'D' => 'Alas-diyes ng gabi'],
                        ],
                        'correct_answer' => ['choice' => 'D'],
                    ],
                    [
                        'order_index' => 5,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_crawl.jpg',
                            'question' => 'Ano ang ginawa ni Juan nang mapansing nasa lansangan pa siya pagsapit ng alas-diyes?',
                            'choices' => [
                                'A' => 'Umuwi siya agad.',
                                'B' => 'Nagtago siya sa bahay.',
                                'C' => 'Gumapang siya.',
                                'D' => 'Tumawag siya ng pulis.',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'C'],
                    ],
                    [
                        'order_index' => 6,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_crawl.jpg',
                            'question' => 'Sino ang nakakita kay Juan habang siya ay gumagapang?',
                            'choices' => ['A' => 'Ang alkalde', 'B' => 'Ang pulis', 'C' => 'Ang mensahero', 'D' => 'Ang guwardiya'],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                    [
                        'order_index' => 7,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_crawl.jpg',
                            'question' => 'Ano ang itinanong ng pulis kay Juan?',
                            'choices' => [
                                'A' => 'Kung saan siya nakatira',
                                'B' => 'Kung bakit naroon pa siya at kung alam niyang bawal maglakad sa kalye pagkatapos ng alas-diyes',
                                'C' => 'Kung saan siya pupunta kinabukasan',
                                'D' => 'Kung bakit hindi siya umuwi',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                    [
                        'order_index' => 8,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_crawl.jpg',
                            'question' => 'Ano ang naging paliwanag ni Juan sa pulis?',
                            'choices' => [
                                'A' => 'Siya ay nagtatago.',
                                'B' => 'Siya ay nagmamadali.',
                                'C' => 'Hindi siya naglalakad kundi gumagapang.',
                                'D' => 'Hindi niya alam ang ordinansa.',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'C'],
                    ],
                    [
                        'order_index' => 9,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_ordinance.jpg',
                            'question' => 'Alin sa sumusunod ang tumutukoy sa tagpuan ng unang pangyayari?',
                            'choices' => ['A' => 'Kalsada', 'B' => 'Kuartel', 'C' => 'Bukid', 'D' => 'Gubat'],
                        ],
                        'correct_answer' => ['choice' => 'A'],
                    ],
                    [
                        'order_index' => 10,
                        'payload' => [
                            'image' => 'challenges/m1_curfew_crawl.jpg',
                            'question' => 'Ano ang ipinakikita ng unang pangyayari tungkol sa paraan ng pag-iisip ni Juan?',
                            'choices' => [
                                'A' => 'Madali siyang sumuko sa suliranin.',
                                'B' => 'Nakaiisip siya ng kakaibang paraan upang harapin ang isang sitwasyon.',
                                'C' => 'Hindi niya nauunawaan ang mga sinasabi ng ibang tao.',
                                'D' => 'Ayaw niyang makipag-usap sa ibang tao.',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                ],
            ],
            [
                'map_number' => 2,
                'title' => 'Ang Kuwartel',
                'strategy_type' => 'sequence',
                'strategy_label' => 'Ayusin ang Banghay',
                'pokus_na_kasanayan' => 'Pagsusuri sa banghay at pagsasaayos ng mga pangyayari ayon sa wastong pagkakasunod-sunod.',
                'panuto' => 'Ayusin ang limang pangyayari mula sa kuwento ayon sa wastong pagkakasunod-sunod, mula una (1) hanggang huli (5).',
                'youtube_start_sec' => 0,
                'youtube_end_sec' => 32,
                'story_video_path' => 'videos/mapa2_kuwartel.mp4',
                'voiceover_mode' => 'default',
                'whole_voiceover_path' => null,
                'max_hearts' => 3,
                'perfect_score' => 10,
                'min_floor_score' => 2,
                'time_limit_seconds' => 60,
                'allow_user_time_choice' => false,
                'feedback_correct' => 'Mahusay! Naipakita mo ang wastong pag-unawa sa pagkakasunod-sunod ng mga pangyayari.',
                'feedback_wrong' => 'Subukan muli. Balikan ang bidyo at tukuyin kung ano ang unang ginawa ni Juan bago siya kinausap ng guwardiya.',
                'scene_script' => [
                    [
                        'scene_title' => 'Scene 1: Ang Pagdaan ni Juan sa Kuwartel',
                        'timestamp' => '0:00–0:11',
                        'start_sec' => 0,
                        'end_sec' => 11,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Kuwartel ng militar na may nakataas na bandila; dumaan si Juan nang nakasuot ng sumbrero at hindi sumaludo.',
                        'dialogue' => 'Narrator: "Kinabukasan, dumaan si Juan Osong sa kuwartel ng militar nang nakasuot ng sumbrero at hindi sumaludo sa bandila."',
                    ],
                    [
                        'scene_title' => 'Scene 2: Ang Pagtatanong ng Guwardiya',
                        'timestamp' => '0:11–0:24',
                        'start_sec' => 11,
                        'end_sec' => 24,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Seryosong guwardiyang sundalo na pinahinto si Juan sa tarangkahan ng kuwartel.',
                        'dialogue' => 'Guwardiya: "Sandali! Bakit hindi ka nag-alis ng sumbrero sa harap ng bandila?" | Juan: "Ginoo, kung mag-aalis po ako ng sumbrero, malalantad po ang ulo ko sa matinding init ng araw."',
                    ],
                    [
                        'scene_title' => 'Scene 3: Ang Babala ng Guwardiya',
                        'timestamp' => '0:24–0:32',
                        'start_sec' => 24,
                        'end_sec' => 32,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Guwardiyang nakaturo sa labas ng bakuran ng kuwartel habang nagbibigay ng mahigpit na babala.',
                        'dialogue' => 'Guwardiya: "Ah, iyan ba ang dahilan mo? Kung gayon, huwag na huwag ka nang aapak sa lugar na ito kahit kailan!"',
                    ],
                ],
                'challenges' => [
                    [
                        'order_index' => 1,
                        'payload' => [
                            'image' => 'challenges/m2_kuwartel_scene.jpg',
                            'prompt' => 'Ayusin ang limang pangyayari mula Una (1) hanggang Huli (5):',
                            'events' => [
                                ['id' => 1, 'text' => 'Ipinaliwanag ni Juan na malalantad sa init ang kaniyang ulo kapag inalis niya ang sumbrero.'],
                                ['id' => 2, 'text' => 'Dumaan si Juan sa kuwartel ng militar.'],
                                ['id' => 3, 'text' => 'Tinanong ng guwardiya si Juan kung bakit hindi niya inalis ang kaniyang sumbrero.'],
                                ['id' => 4, 'text' => 'Hindi inalis ni Juan ang kaniyang sumbrero at hindi sumaludo sa bandila.'],
                                ['id' => 5, 'text' => 'Binalaan ng guwardiya si Juan na huwag nang umapak sa lugar na iyon.'],
                            ],
                        ],
                        'correct_answer' => ['order' => [2, 4, 3, 1, 5]],
                    ],
                ],
            ],
            [
                'map_number' => 3,
                'title' => 'Ang Kariton ng Lupa',
                'strategy_type' => 'matching',
                'strategy_label' => 'Sanhi at Bunga: Match It!',
                'pokus_na_kasanayan' => 'Pagsusuri sa sanhi at bunga ng mga pangyayari at pagpapaliwanag sa mga kilos ng tauhan.',
                'panuto' => 'Itugma ang bawat pangyayari sa Hanay A sa tamang paliwanag o bunga nito sa Hanay B.',
                'youtube_start_sec' => 0,
                'youtube_end_sec' => 28,
                'story_video_path' => 'videos/mapa3_kariton.mp4',
                'voiceover_mode' => 'default',
                'whole_voiceover_path' => null,
                'max_hearts' => 3,
                'perfect_score' => 10,
                'min_floor_score' => 2,
                'time_limit_seconds' => 60,
                'allow_user_time_choice' => false,
                'feedback_correct' => 'Mahusay! Naunawaan mo ang ugnayan ng mga pangyayari at ang mga dahilan sa likod ng mga kilos ng tauhan.',
                'feedback_wrong' => 'Subukan muli. Suriin kung ano ang dahilan ng pagkilos ni Juan at kung ano ang naging bunga nito.',
                'scene_script' => [
                    [
                        'scene_title' => 'Scene 1: Ang Pagdadala ng Sariling Lupa',
                        'timestamp' => '0:00–0:13',
                        'start_sec' => 0,
                        'end_sec' => 13,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Naghukay si Juan ng lupa sa bukid, inilagay sa kariton na hinihila ng kalabaw habang dumaraan sa munisipyo.',
                        'dialogue' => 'Narrator: "Dahil kailangang dumaan ni Juan sa munisipyo patungong palengke, naghukay siya ng lupa sa sariling bukid at isinakay ito sa kariton na hinihila ng kalabaw."',
                    ],
                    [
                        'scene_title' => 'Scene 2: Ang Muling Pagharap sa Sundalo',
                        'timestamp' => '0:13–0:21',
                        'start_sec' => 13,
                        'end_sec' => 21,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Natigilan ang sundalo nang makita si Juan na nakatuntong sa ibabaw ng karitong puno ng lupa.',
                        'dialogue' => 'Sundalo: "Hoy, Juan! Hindi ba sinabi ko noong isang araw na huwag na huwag ka nang aapak sa lupang ito kahit kailan?"',
                    ],
                    [
                        'scene_title' => 'Scene 3: Ang Paliwanag ni Juan',
                        'timestamp' => '0:21–0:28',
                        'start_sec' => 21,
                        'end_sec' => 28,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Itinuro ni Juan ang lupang nasa ilalim ng kaniyang mga paa sa kariton nang may ngiti.',
                        'dialogue' => 'Juan: "Opo, Ginoo. Pero tingnan po ninyo, nakatapak naman po ako sa sarili kong lupa!"',
                    ],
                ],
                'challenges' => [
                    [
                        'order_index' => 1,
                        'payload' => [
                            'image' => 'challenges/m3_kariton_scene.jpg',
                            'prompt' => 'Itugma ang Hanay A sa kaugnay na paliwanag o bunga sa Hanay B:',
                            'column_a' => [
                                ['id' => '1', 'text' => 'Kinakailangang dumaan ni Juan sa munisipyo araw-araw.'],
                                ['id' => '2', 'text' => 'Nagdala si Juan ng lupa mula sa kaniyang bukid.'],
                                ['id' => '3', 'text' => 'Gumamit siya ng karitong hinihila ng kalabaw.'],
                                ['id' => '4', 'text' => 'Pinagsabihan siya ng sundalo na huwag nang umapak sa lugar.'],
                                ['id' => '5', 'text' => 'Sinabi ni Juan na nakatapak siya sa sarili niyang lupa.'],
                            ],
                            'column_b' => [
                                ['id' => 'A', 'text' => 'Naging dahilan ito upang muling kausapin siya ng sundalo.'],
                                ['id' => 'B', 'text' => 'Nais niyang magkaroon ng lupang matatapakan habang dumaraan sa lugar.'],
                                ['id' => 'C', 'text' => 'Kinailangan niyang dumaan sa lugar upang pumunta sa palengke.'],
                                ['id' => 'D', 'text' => 'Ginamit niya ito upang maihatid ang lupang kinuha sa kaniyang bukid.'],
                                ['id' => 'E', 'text' => 'Ipinakita niya ang kaniyang sariling paliwanag sa pagbabawal ng sundalo.'],
                            ],
                        ],
                        'correct_answer' => [
                            'pairs' => [
                                '1' => 'C',
                                '2' => 'B',
                                '3' => 'D',
                                '4' => 'A',
                                '5' => 'E',
                            ],
                        ],
                    ],
                ],
            ],
            [
                'map_number' => 4,
                'title' => 'Ang Pinto at Palakol',
                'strategy_type' => 'four_pics',
                'strategy_label' => '4 Pics, 1 Word',
                'pokus_na_kasanayan' => 'Pagpapakahulugan sa mga pahiwatig at pagsusuri sa kahulugan ng mga kilos at bagay na may kaugnayan sa kuwento.',
                'panuto' => 'Suriin ang apat na larawan at ang pahiwatig sa bawat bilang, pagkatapos ay buuin ang tamang salita gamit ang mga titik.',
                'youtube_start_sec' => 0,
                'youtube_end_sec' => 38,
                'story_video_path' => 'videos/mapa4_pinto.mp4',
                'voiceover_mode' => 'default',
                'whole_voiceover_path' => null,
                'max_hearts' => 3,
                'perfect_score' => 10,
                'min_floor_score' => 2,
                'time_limit_seconds' => 60,
                'allow_user_time_choice' => false,
                'feedback_correct' => 'Mahusay! Natukoy mo ang mga mahahalagang bagay at detalye sa kuwento sa pamamagitan ng pagsusuri sa mga larawan.',
                'feedback_wrong' => 'Subukan muli! Suriin ang mga larawang ipinakita at iugnay ang mga ito sa napanood na kuwento.',
                'scene_script' => [
                    [
                        'scene_title' => 'Scene 1: Ang Utos ni Pedro',
                        'timestamp' => '0:00–0:16',
                        'start_sec' => 0,
                        'end_sec' => 16,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Bahay kubo sa gilid ng bukid. Inutusan ni Pedro si Juan na ikandado ang pinto, ngunit kinalas at binuhat ni Juan ang buong pinto.',
                        'dialogue' => 'Narrator: "Isang araw, naghahanda sina Pedro at Juan na pumunta sa gubat upang magsibak ng kahoy. Inutusan ni Pedro si Juan na ikandado ang pinto, ngunit sa halip ay kinalas at binuhat ni Juan ang buong pinto."',
                    ],
                    [
                        'scene_title' => 'Scene 2: Ang Paliwanag ni Juan',
                        'timestamp' => '0:16–0:29',
                        'start_sec' => 16,
                        'end_sec' => 29,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Naglalakad si Juan na pasan ang pinto at may dalang palakol kasama si Pedro.',
                        'dialogue' => 'Pedro: "Juan! Bakit mo naman dinala ang buong pinto ng bahay natin?" | Juan: "Mas mainam nang huwag itong iwan, Pedro, para wala talagang magnanakaw na makapasok sa bahay natin!"',
                    ],
                    [
                        'scene_title' => 'Scene 3: Ang Pagpapahinga sa Puno',
                        'timestamp' => '0:29–0:38',
                        'start_sec' => 29,
                        'end_sec' => 38,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Malilim na malaking puno sa gitna ng gubat kung saan umakyat ang magkapatid upang magpahinga.',
                        'dialogue' => 'Narrator: "Pagdating sa gubat, umakyat ang magkapatid sa malilim na puno upang magpahinga habang dala pa rin ang pinto at ang palakol."',
                    ],
                ],
                'challenges' => [
                    [
                        'order_index' => 1,
                        'payload' => [
                            'clue' => 'Anong bagay ang ipinag-utos ni Pedro na ikandado ngunit sa halip ay dinala ni Juan?',
                            'images' => [
                                'challenges/m4_p1_1_door.jpg',
                                'challenges/m4_p1_2_lock.jpg',
                                'challenges/m4_p1_3_kubo.jpg',
                                'challenges/m4_p1_4_carry.jpg',
                            ],
                            'visual_hints' => ['Kahoy na Pinto', 'Kandado', 'Bahay Kubo', 'Binuhat ni Juan'],
                            'word_length' => 5,
                            'scrambled_letters' => ['O', 'P', 'T', 'I', 'N', 'K', 'A', 'S'],
                        ],
                        'correct_answer' => ['word' => 'PINTO'],
                    ],
                    [
                        'order_index' => 2,
                        'payload' => [
                            'clue' => 'Saan umakyat ang magkapatid upang magpahinga?',
                            'images' => [
                                'challenges/m4_p2_1_leaves.jpg',
                                'challenges/m4_p2_2_branches.jpg',
                                'challenges/m4_p2_3_shade.jpg',
                                'challenges/m4_p2_4_climb.jpg',
                            ],
                            'visual_hints' => ['Malalagong Dahon', 'Matayog na Sanga', 'Lilim sa Gubat', 'Pag-akyat'],
                            'word_length' => 4,
                            'scrambled_letters' => ['N', 'P', 'O', 'U', 'G', 'A', 'L', 'T'],
                        ],
                        'correct_answer' => ['word' => 'PUNO'],
                    ],
                    [
                        'order_index' => 3,
                        'payload' => [
                            'clue' => 'Anong kagamitan ang dinala ni Juan upang magamit nila sa pagsisibak ng kahoy?',
                            'images' => [
                                'challenges/m4_p3_1_blade.jpg',
                                'challenges/m4_p3_2_handle.jpg',
                                'challenges/m4_p3_3_chop.jpg',
                                'challenges/m4_p3_4_logs.jpg',
                            ],
                            'visual_hints' => ['Matalim na Talim', 'Tangkay na Kahoy', 'Pagsisibak', 'Troso'],
                            'word_length' => 7,
                            'scrambled_letters' => ['L', 'P', 'A', 'K', 'O', 'A', 'L', 'B', 'I', 'T'],
                        ],
                        'correct_answer' => ['word' => 'PALAKOL'],
                    ],
                    [
                        'order_index' => 4,
                        'payload' => [
                            'clue' => 'Saan nagtungo sina Juan at Pedro upang magsibak ng kahoy?',
                            'images' => [
                                'challenges/m4_p4_1_woods.jpg',
                                'challenges/m4_p4_2_river.jpg',
                                'challenges/m4_p4_3_nature.jpg',
                                'challenges/m4_p4_4_trail.jpg',
                            ],
                            'visual_hints' => ['Makapal na Kakahuyan', 'Ilog at Bato', 'Tahimik na Kalikasan', 'Daanan sa Bukid'],
                            'word_length' => 5,
                            'scrambled_letters' => ['B', 'G', 'T', 'U', 'A', 'P', 'L', 'O'],
                        ],
                        'correct_answer' => ['word' => 'GUBAT'],
                    ],
                    [
                        'order_index' => 5,
                        'payload' => [
                            'clue' => 'Ano ang ugnayan nina Juan at Pedro?',
                            'images' => [
                                'challenges/m4_p5_1_brothers.jpg',
                                'challenges/m4_p5_2_home.jpg',
                                'challenges/m4_p5_3_walk.jpg',
                                'challenges/m4_p5_4_family.jpg',
                            ],
                            'visual_hints' => ['Dalawang Binata', 'Magkasama sa Bahay', 'Magkatuwang', 'Pamilya'],
                            'word_length' => 10,
                            'scrambled_letters' => ['D', 'M', 'A', 'P', 'K', 'G', 'T', 'I', 'A', 'A', 'N', 'O'],
                        ],
                        'correct_answer' => ['word' => 'MAGKAPATID'],
                    ],
                ],
            ],
            [
                'map_number' => 5,
                'title' => 'Ang mga Magnanakaw',
                'strategy_type' => 'decision_quest',
                'strategy_label' => 'Ikaw ang Magpapasiya!',
                'pokus_na_kasanayan' => 'Pag-uugnay ng aral ng kuwento sa sariling karanasan at pagpapahalaga sa mga pagpapahalagang Pilipino.',
                'panuto' => 'Basahin ang bawat sitwasyon at piliin ang pinakaangkop, ligtas, at responsableng pasiya.',
                'youtube_start_sec' => 0,
                'youtube_end_sec' => 50,
                'story_video_path' => 'videos/mapa5_magnanakaw.mp4',
                'voiceover_mode' => 'default',
                'whole_voiceover_path' => null,
                'max_hearts' => 3,
                'perfect_score' => 10,
                'min_floor_score' => 2,
                'time_limit_seconds' => 60,
                'allow_user_time_choice' => false,
                'feedback_correct' => 'Mahusay! Naipakita mo ang kakayahang magpasya nang mapanuri at maiugnay ang aral ng kuwento sa tunay na buhay.',
                'feedback_wrong' => 'Pag-isipan muli ang iyong sagot. Isaalang-alang ang maaaring maging bunga ng iyong pasiya at ang kaligtasan ng iyong sarili at ng iba.',
                'scene_script' => [
                    [
                        'scene_title' => 'Scene 1: Pagdating ng mga Magnanakaw',
                        'timestamp' => '0:00–0:11',
                        'start_sec' => 0,
                        'end_sec' => 11,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Sa ilalim ng puno, dumating ang grupo ng mga magnanakaw na may dalang sako at naghati ng kanilang ninakaw.',
                        'dialogue' => 'Narrator: "Hindi nagtagal, dumating ang mga magnanakaw sa ilalim ng punong pinagpapahingahan nina Juan at Pedro at nagsimulang maghati ng kanilang ninakaw."',
                    ],
                    [
                        'scene_title' => 'Scene 2: Ang Amoy ng Pagkain',
                        'timestamp' => '0:11–0:20',
                        'start_sec' => 11,
                        'end_sec' => 20,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Nagluto ang mga magnanakaw sa siga; napatingin si Juan mula sa itaas ng sanga dahil sa bango ng ulam.',
                        'dialogue' => 'Narrator: "Nagluto ang mga magnanakaw sa siga, at labis na naakit si Juan sa masarap na amoy ng pagkain mula sa itaas ng puno."',
                    ],
                    [
                        'scene_title' => 'Scene 3: Ang Pagbagsak ng Pinto',
                        'timestamp' => '0:20–0:28',
                        'start_sec' => 20,
                        'end_sec' => 28,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Ibinagsak ni Juan ang mabigat na pinto sa tabi ng mga magnanakaw habang nagpapanggap na higante.',
                        'dialogue' => 'Juan: "Ako ay malaking tao, isang higante! Bakit kayo nangangahas na istorbuhin ako?"',
                    ],
                    [
                        'scene_title' => 'Scene 4: Ang Ngipin ng Higante',
                        'timestamp' => '0:28–0:41',
                        'start_sec' => 28,
                        'end_sec' => 41,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Hinulog ni Juan ang palakol kaya natakot at nagtakbuhan papalayo ang mga magnanakaw.',
                        'dialogue' => 'Magnanakaw: "Kung sadyang ikaw nga ay higante, ihulog mo nga ang isa sa iyong mga ngipin!" | Narrator: "Hinulog ni Juan ang mabigat na palakol kaya natakot at kumaripas ng takbo papalayo ang mga magnanakaw."',
                    ],
                    [
                        'scene_title' => 'Scene 5: Ang Pag-uwi ng Magkapatid',
                        'timestamp' => '0:41–0:50',
                        'start_sec' => 41,
                        'end_sec' => 50,
                        'audio_offset_sec' => 0,
                        'visual_guide' => 'Bumaba sina Juan at Pedro mula sa puno, pinagsaluhan ang pagkain, at iniuwi ang naiwang sako.',
                        'dialogue' => 'Narrator: "Bumaba sina Juan at Pedro mula sa puno, pinagsaluhan ang masarap na pagkain, at masayang iniuwi ang naiwang sako."',
                    ],
                ],
                'challenges' => [
                    [
                        'order_index' => 1,
                        'payload' => [
                            'image' => 'challenges/m5_magnanakaw_scene.jpg',
                            'scenario' => 'Habang nasa isang pampublikong lugar, nakakita ka ng pangkat ng mga taong naghahati-hati ng mga bagay na pinaghihinalaang ninakaw. Ano ang pinakamainam mong gawin?',
                            'choices' => [
                                'A' => 'Lumapit upang makialam',
                                'B' => 'Iwasan ang lugar at humingi ng tulong sa nakatatanda o kinauukulan',
                                'C' => 'Hamunin sila',
                                'D' => 'Kumuha ng mga gamit',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                    [
                        'order_index' => 2,
                        'payload' => [
                            'image' => 'challenges/m4_p5_1_brothers.jpg',
                            'scenario' => 'Kasama mo ang iyong kapatid at napansin ninyong may kahina-hinalang pangyayari sa inyong paligid. Ano ang dapat ninyong gawin?',
                            'choices' => [
                                'A' => 'Kumilos nang mag-isa',
                                'B' => 'Maghiwa-hiwalay',
                                'C' => 'Manatili sa ligtas na lugar at humingi ng tulong sa kinauukulan',
                                'D' => 'Lumapit sa mga taong sangkot',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'C'],
                    ],
                    [
                        'order_index' => 3,
                        'payload' => [
                            'image' => 'challenges/m5_magnanakaw_scene.jpg',
                            'scenario' => 'Sa kuwento, ipinakita ni Juan ang kakaibang paraan ng pagharap sa mga sitwasyon. Ano ang dapat mong isaalang-alang bago gumawa ng pasiya sa isang mahirap na kalagayan?',
                            'choices' => [
                                'A' => 'Ang maaaring maging bunga ng iyong gagawin',
                                'B' => 'Ang kagustuhan ng ibang tao lamang',
                                'C' => 'Ang pinakamadaling paraan kahit may panganib',
                                'D' => 'Ang pagkakataong makaiwas sa pananagutan',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'A'],
                    ],
                    [
                        'order_index' => 4,
                        'payload' => [
                            'image' => 'challenges/m4_p5_3_walk.jpg',
                            'scenario' => 'Kung may suliraning kinakaharap ang iyong kapatid o kaibigan, anong pagpapahalaga ang dapat mong ipakita?',
                            'choices' => [
                                'A' => 'Pagkakanya-kanya',
                                'B' => 'Pagtutulungan at malasakit',
                                'C' => 'Pagsisi sa kapwa',
                                'D' => 'Pagwawalang-bahala',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'B'],
                    ],
                    [
                        'order_index' => 5,
                        'payload' => [
                            'image' => 'challenges/m4_p5_4_family.jpg',
                            'scenario' => 'Alin sa sumusunod ang pinakamahalagang aral na maaari mong iugnay sa kabuuan ng kuwento ni Juan Osong?',
                            'choices' => [
                                'A' => 'Dapat gayahin ang lahat ng ginagawa ng tauhan',
                                'B' => 'Harapin ang suliranin nang walang pag-iingat',
                                'C' => 'Mahalaga ang pagiging mapanuri, malikhain, at responsable sa pagharap sa mga sitwasyon',
                                'D' => 'Hindi kailangang humingi ng tulong',
                            ],
                        ],
                        'correct_answer' => ['choice' => 'C'],
                    ],
                ],
            ],
        ];
    }
}
