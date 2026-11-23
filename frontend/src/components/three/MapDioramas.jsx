import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import NpcGuardFigure from './GuardFigure';

/* Per-map building dioramas (moved out of MapLandmarkNode). Local +X follows the road,
   buildings sit at the back (-Z), guards at the front (+Z) so the road stays free. */
function Mapa1CurfewDiorama({ dim, stoneMap, stoneBump, woodMap, lowQuality }) {
    return (
        <group>
            {/* Spanish-Filipino Colonial Munisipyo Arcade Building */}
            <group position={[-1.05, 0, -1.25]}>
                <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.65, 0.84, 1.15]} />
                    <meshStandardMaterial map={stoneMap} bumpMap={stoneBump} bumpScale={0.07} roughness={0.85} />
                </mesh>
                <mesh position={[0, 1.25, 0]} castShadow>
                    <boxGeometry args={[1.58, 0.85, 1.08]} />
                    <meshStandardMaterial color={dim < 1 ? '#94A3B8' : '#F5EFE6'} roughness={0.8} />
                </mesh>
                {/* Arched Timber Doorway & Capiz Window Shutters */}
                <mesh position={[0, 0.42, 0.59]}>
                    <boxGeometry args={[0.48, 0.72, 0.05]} />
                    <meshStandardMaterial map={woodMap} color="#5C3A21" />
                </mesh>
                {[-0.45, 0.45].map((wx, i) => (
                    <mesh key={i} position={[wx, 1.25, 0.55]}>
                        <boxGeometry args={[0.36, 0.44, 0.05]} />
                        <meshStandardMaterial color="#FEF3C7" emissive="#F59E0B" emissiveIntensity={0.35} />
                    </mesh>
                ))}
                {/* Terracotta Clay Hip Roof */}
                <mesh position={[0, 2.02, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[1.38, 0.78, 4]} />
                    <meshStandardMaterial color={dim < 1 ? '#64748B' : '#B91C1C'} roughness={0.72} />
                </mesh>
            </group>

            {/* Wrought-Iron Dusk Streetlamp with Warm PointLight */}
            <group position={[1.45, 0, -1.05]}>
                <mesh position={[0, 0.2, 0]} castShadow>
                    <cylinderGeometry args={[0.14, 0.2, 0.4, 10]} />
                    <meshStandardMaterial color="#1E293B" metalness={0.6} roughness={0.4} />
                </mesh>
                <mesh position={[0, 1.45, 0]} castShadow>
                    <cylinderGeometry args={[0.06, 0.09, 2.5, 10]} />
                    <meshStandardMaterial color="#1E293B" metalness={0.6} roughness={0.4} />
                </mesh>
                <mesh position={[0, 2.82, 0]}>
                    <cylinderGeometry args={[0.24, 0.16, 0.46, 6]} />
                    <meshStandardMaterial
                        color="#FEF08A"
                        emissive="#F59E0B"
                        emissiveIntensity={dim < 1 ? 0.2 : 1.8}
                    />
                </mesh>
                <mesh position={[0, 3.16, 0]}>
                    <coneGeometry args={[0.3, 0.26, 6]} />
                    <meshStandardMaterial color="#1E293B" metalness={0.6} />
                </mesh>
                {!lowQuality && dim === 1 && (
                    <pointLight position={[0, 2.6, 0.2]} color="#F59E0B" intensity={2.2} distance={6} />
                )}
            </group>

            {/* Wooden Municipal Ordinance Bulletin Board (10:00 PM Curfew) */}
            <group position={[0.35, 0, -1.55]}>
                <mesh position={[-0.36, 0.65, 0]} castShadow>
                    <cylinderGeometry args={[0.05, 0.05, 1.3, 8]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                <mesh position={[0.36, 0.65, 0]} castShadow>
                    <cylinderGeometry args={[0.05, 0.05, 1.3, 8]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                <mesh position={[0, 1.05, 0]} castShadow>
                    <boxGeometry args={[0.88, 0.58, 0.08]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                <mesh position={[0, 1.05, 0.05]}>
                    <planeGeometry args={[0.72, 0.44]} />
                    <meshStandardMaterial color="#FFFBEB" />
                </mesh>
            </group>

            {/* 3D Town Pulis Guard NPC */}
            <NpcGuardFigure
                position={[0.9, 0, 1.4]}
                rotation={[0, -0.35, 0]}
                scale={0.9}
                uniformColor="#1E3A8A"
                lantern
                lowQuality={lowQuality}
            />
        </group>
    );
}

function Mapa2KuwartelDiorama({ dim, stoneMap, stoneBump, woodMap }) {
    const flagRef = useRef();
    useFrame(({ clock }) => {
        if (flagRef.current) {
            flagRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 3.8) * 0.22;
        }
    });

    return (
        <group>
            {/* Stone Masonry Fortress Barracks & Battlements */}
            <group position={[1.15, 0, -1.5]}>
                <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.75, 1.56, 1.65]} />
                    <meshStandardMaterial map={stoneMap} bumpMap={stoneBump} bumpScale={0.09} roughness={0.85} />
                </mesh>
                {/* Crenelated Stone Battlements */}
                {[-0.65, -0.22, 0.22, 0.65].map((bx, i) => (
                    <mesh key={i} position={[bx, 1.66, 0.76]} castShadow>
                        <boxGeometry args={[0.26, 0.24, 0.16]} />
                        <meshStandardMaterial map={stoneMap} bumpMap={stoneBump} bumpScale={0.06} />
                    </mesh>
                ))}
                {/* Timber Upper Watchtower & Roof */}
                <mesh position={[0, 2.05, 0]} castShadow>
                    <boxGeometry args={[1.25, 0.95, 1.25]} />
                    <meshStandardMaterial map={woodMap} roughness={0.78} />
                </mesh>
                <mesh position={[0, 2.86, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[1.22, 0.85, 4]} />
                    <meshStandardMaterial color={dim < 1 ? '#475569' : '#7C2D12'} roughness={0.75} />
                </mesh>
            </group>

            {/* Tall Garrison Flagpole & Waving Banner */}
            <group position={[-1.35, 0, -1.1]}>
                <mesh position={[0, 0.16, 0]} castShadow>
                    <cylinderGeometry args={[0.22, 0.28, 0.32, 12]} />
                    <meshStandardMaterial map={stoneMap} />
                </mesh>
                <mesh position={[0, 1.8, 0]} castShadow>
                    <cylinderGeometry args={[0.045, 0.065, 3.5, 10]} />
                    <meshStandardMaterial color="#E2E8F0" metalness={0.65} roughness={0.3} />
                </mesh>
                <group ref={flagRef} position={[0, 3.18, 0]}>
                    <mesh position={[0.52, 0, 0]} castShadow>
                        <boxGeometry args={[1.04, 0.56, 0.04]} />
                        <meshStandardMaterial color={dim < 1 ? '#64748B' : '#DC2626'} />
                    </mesh>
                    <mesh position={[0.2, 0.14, 0.01]}>
                        <boxGeometry args={[0.4, 0.28, 0.045]} />
                        <meshStandardMaterial color={dim < 1 ? '#94A3B8' : '#1D4ED8'} />
                    </mesh>
                </group>
            </group>

            {/* 3D Military Guwardiya NPC */}
            <NpcGuardFigure
                position={[-1.0, 0, 1.4]}
                rotation={[0, 0.3, 0]}
                scale={0.9}
                uniformColor="#3F6212"
                hatColor="#365314"
            />
            <NpcGuardFigure
                position={[1.15, 0, 1.3]}
                rotation={[0, -0.3, 0]}
                scale={0.9}
                uniformColor="#3F6212"
                hatColor="#365314"
            />
        </group>
    );
}

function Mapa3KaritonDiorama({ dim, stoneMap, woodMap }) {
    return (
        <group>
            {/* Detailed Spoked Wooden Kariton Cart Heaped with Rich Soil */}
            <group position={[1.15, 0, -1.4]}>
                {/* Cart Bed & Side Slats */}
                <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.55, 0.48, 1.05]} />
                    <meshStandardMaterial map={woodMap} roughness={0.8} />
                </mesh>
                {/* Heaped Organic Soil Mound inside Cart */}
                <mesh position={[0.05, 0.94, 0]} scale={[1.25, 0.78, 0.95]} castShadow>
                    <dodecahedronGeometry args={[0.62, 2]} />
                    <meshStandardMaterial color={dim < 1 ? '#475569' : '#5C3A21'} roughness={0.96} />
                </mesh>
                {/* Wooden Drawbar Shafts */}
                {[-0.36, 0.36].map((zOff, i) => (
                    <mesh key={i} position={[-1.15, 0.52, zOff]} rotation={[0, 0, Math.PI / 2]} castShadow>
                        <cylinderGeometry args={[0.04, 0.045, 1.1, 8]} />
                        <meshStandardMaterial map={woodMap} />
                    </mesh>
                ))}
                {/* Spoked Wooden Wheels with Iron Rims */}
                {[-0.58, 0.58].map((zOff, i) => (
                    <group key={i} position={[0, 0.38, zOff]}>
                        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                            <torusGeometry args={[0.36, 0.05, 10, 20]} />
                            <meshStandardMaterial color="#3E2723" metalness={0.3} roughness={0.6} />
                        </mesh>
                        <mesh rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.1, 0.1, 0.12, 12]} />
                            <meshStandardMaterial map={woodMap} />
                        </mesh>
                        {[0, 1, 2, 3].map((sp) => (
                            <mesh key={sp} rotation={[0, 0, (sp * Math.PI) / 4]}>
                                <cylinderGeometry args={[0.025, 0.025, 0.7, 6]} />
                                <meshStandardMaterial map={woodMap} />
                            </mesh>
                        ))}
                    </group>
                ))}
            </group>

            {/* Realistic Sculpted 3D Filipino Kalabaw (Carabao) */}
            <group position={[-0.75, 0, -1.3]}>
                {/* Muscular Barrel Torso */}
                <mesh position={[0, 0.62, 0]} scale={[1.38, 0.92, 0.88]} castShadow>
                    <sphereGeometry args={[0.45, 18, 14]} />
                    <meshStandardMaterial color={dim < 1 ? '#64748B' : '#2D3748'} roughness={0.78} />
                </mesh>
                {/* Shoulders & Neck */}
                <mesh position={[-0.45, 0.7, 0]} scale={[0.95, 0.95, 0.82]} castShadow>
                    <sphereGeometry args={[0.32, 14, 12]} />
                    <meshStandardMaterial color={dim < 1 ? '#64748B' : '#2D3748'} roughness={0.78} />
                </mesh>
                {/* Head & Muzzle */}
                <mesh position={[-0.78, 0.76, 0]} rotation={[0, 0, 0.35]} scale={[1.25, 0.88, 0.85]} castShadow>
                    <sphereGeometry args={[0.22, 14, 12]} />
                    <meshStandardMaterial color={dim < 1 ? '#64748B' : '#1E293B'} roughness={0.72} />
                </mesh>
                {/* Sweeping Curved Carabao Horns */}
                {[-1, 1].map((side) => (
                    <mesh
                        key={side}
                        position={[-0.74, 0.92, side * 0.28]}
                        rotation={[side * 0.65, 0.2, 0.4]}
                        castShadow
                    >
                        <coneGeometry args={[0.055, 0.48, 10]} />
                        <meshStandardMaterial color="#E2E8F0" roughness={0.4} />
                    </mesh>
                ))}
                {/* 4 Sturdy Articulated Legs */}
                {[
                    [-0.38, -0.22],
                    [-0.38, 0.22],
                    [0.36, -0.22],
                    [0.36, 0.22],
                ].map(([lx, lz], idx) => (
                    <mesh key={idx} position={[lx, 0.26, lz]} castShadow>
                        <cylinderGeometry args={[0.075, 0.06, 0.52, 10]} />
                        <meshStandardMaterial color="#1E293B" roughness={0.8} />
                    </mesh>
                ))}
            </group>

            {/* Roadside Munisipyo Stone Marker & Guard NPC */}
            <mesh position={[-1.55, 0.45, 1.3]} castShadow>
                <boxGeometry args={[0.38, 0.9, 0.38]} />
                <meshStandardMaterial map={stoneMap} />
            </mesh>
            <NpcGuardFigure
                position={[1.2, 0, 1.4]}
                rotation={[0, -0.4, 0]}
                scale={0.9}
                uniformColor="#1E3A8A"
            />
        </group>
    );
}

function Mapa4KuboDiorama({ dim, woodMap }) {
    return (
        <group>
            {/* Authentic Stilted Filipino Bahay Kubo */}
            <group position={[1.15, 0, -1.75]}>
                {/* Bamboo Stilts */}
                {[
                    [-0.68, -0.62],
                    [0.68, -0.62],
                    [-0.68, 0.62],
                    [0.68, 0.62],
                ].map(([sx, sz], i) => (
                    <mesh key={i} position={[sx, 0.36, sz]} castShadow>
                        <cylinderGeometry args={[0.075, 0.085, 0.72, 10]} />
                        <meshStandardMaterial map={woodMap} roughness={0.75} />
                    </mesh>
                ))}
                {/* Woven Floor Deck */}
                <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.68, 0.1, 1.56]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                {/* Sawali Bamboo Walls */}
                <mesh position={[0, 1.36, 0]} castShadow>
                    <boxGeometry args={[1.52, 1.15, 1.4]} />
                    <meshStandardMaterial map={woodMap} color={dim < 1 ? '#94A3B8' : '#D99B52'} roughness={0.82} />
                </mesh>
                {/* Open Doorway Frame (since Juan carried the door away!) */}
                <mesh position={[-0.25, 1.24, 0.71]}>
                    <boxGeometry args={[0.46, 0.86, 0.05]} />
                    <meshStandardMaterial color="#1E1B18" />
                </mesh>
                {/* Capiz Awning Window */}
                <mesh position={[0.38, 1.38, 0.72]} rotation={[-0.35, 0, 0]} castShadow>
                    <boxGeometry args={[0.46, 0.42, 0.05]} />
                    <meshStandardMaterial color="#FEF3C7" />
                </mesh>
                {/* Bamboo Entry Ladder */}
                <mesh position={[-0.25, 0.42, 1.02]} rotation={[-0.55, 0, 0]} castShadow>
                    <boxGeometry args={[0.42, 0.82, 0.06]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                {/* Multi-Layered Nipa Thatched Roof & Ridge Beam */}
                <mesh position={[0, 2.28, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[1.62, 0.96, 4]} />
                    <meshStandardMaterial color={dim < 1 ? '#475569' : '#854D0E'} roughness={0.94} />
                </mesh>
                <mesh position={[0, 2.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[1.05, 0.65, 4]} />
                    <meshStandardMaterial color={dim < 1 ? '#475569' : '#713F12'} roughness={0.94} />
                </mesh>
            </group>

            {/* The Detached Paneled Wooden Door (Ang Pinto) */}
            <group position={[-1.05, 0.68, -0.95]} rotation={[0, 0.28, 0.16]}>
                <mesh castShadow>
                    <boxGeometry args={[0.68, 1.28, 0.12]} />
                    <meshStandardMaterial map={woodMap} color="#9A3412" roughness={0.75} />
                </mesh>
                <mesh position={[0.22, 0, 0.08]}>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshStandardMaterial color="#F59E0B" metalness={0.8} roughness={0.2} />
                </mesh>
            </group>

            {/* Steel-Headed Palakol (Axe) Embedded in Chopping Block + Split Firewood */}
            <group position={[-1.5, 0, 1.25]}>
                <mesh position={[0, 0.3, 0]} castShadow>
                    <cylinderGeometry args={[0.32, 0.36, 0.6, 12]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                <mesh position={[0, 0.85, 0]} rotation={[0, 0, -0.38]} castShadow>
                    <cylinderGeometry args={[0.038, 0.045, 0.82, 10]} />
                    <meshStandardMaterial map={woodMap} />
                </mesh>
                <mesh position={[0.12, 0.65, 0]} rotation={[0, 0, -0.38]} castShadow>
                    <boxGeometry args={[0.32, 0.2, 0.06]} />
                    <meshStandardMaterial color="#E2E8F0" metalness={0.75} roughness={0.25} />
                </mesh>
            </group>
        </group>
    );
}

function Mapa5ForestDiorama({ dim, stoneMap, woodMap, lowQuality }) {
    const flameRef = useRef();
    useFrame(({ clock }) => {
        if (flameRef.current) {
            const t = clock.getElapsedTime();
            const s = 1 + Math.sin(t * 9) * 0.14;
            flameRef.current.scale.set(1, s, 1);
        }
    });

    return (
        <group>
            {/* Ancient Gnarled Shady Forest Tree with Buttress Roots & Layered Canopy */}
            <group position={[1.25, 0, -1.25]}>
                {/* Buttress Roots */}
                {[0, 1.57, 3.14, 4.71].map((ang, i) => (
                    <mesh
                        key={i}
                        position={[Math.cos(ang) * 0.38, 0.35, Math.sin(ang) * 0.38]}
                        rotation={[Math.sin(ang) * 0.35, 0, -Math.cos(ang) * 0.35]}
                        castShadow
                    >
                        <cylinderGeometry args={[0.12, 0.26, 0.8, 8]} />
                        <meshStandardMaterial map={woodMap} color="#5C3A21" />
                    </mesh>
                ))}
                {/* Main Trunk */}
                <mesh position={[0, 1.35, 0]} castShadow>
                    <cylinderGeometry args={[0.34, 0.54, 2.7, 12]} />
                    <meshStandardMaterial map={woodMap} color="#5C3A21" roughness={0.9} />
                </mesh>
                {/* Dense Multi-Sphere Leaf Canopy */}
                {[
                    [0, 2.95, 0, 1.42, '#14532D'],
                    [-0.85, 2.6, 0.55, 0.96, '#15803D'],
                    [0.85, 2.65, -0.5, 1.02, '#166534'],
                    [0.45, 2.75, 0.75, 0.88, '#15803D'],
                    [-0.55, 2.7, -0.7, 0.92, '#14532D'],
                ].map(([cx, cy, cz, r, col], idx) => (
                    <mesh key={idx} position={[cx, cy, cz]} castShadow>
                        <sphereGeometry args={[r, 14, 12]} />
                        <meshStandardMaterial color={dim < 1 ? '#475569' : col} roughness={0.85} />
                    </mesh>
                ))}
            </group>

            {/* Stone-Ringed Campfire + Tripod Cooking Pot + Flickering PointLight */}
            <group position={[-0.5, 0, -1.4]}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                    const a = (i / 8) * Math.PI * 2;
                    return (
                        <mesh key={i} position={[Math.cos(a) * 0.46, 0.1, Math.sin(a) * 0.46]} castShadow>
                            <dodecahedronGeometry args={[0.14, 1]} />
                            <meshStandardMaterial map={stoneMap} />
                        </mesh>
                    );
                })}
                {/* Crossed Firewood Logs */}
                <mesh position={[0, 0.12, 0]} rotation={[0, 0.4, Math.PI / 2]}>
                    <cylinderGeometry args={[0.07, 0.07, 0.7, 8]} />
                    <meshStandardMaterial map={woodMap} color="#3E2723" />
                </mesh>
                <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0.4, 0]}>
                    <cylinderGeometry args={[0.07, 0.07, 0.7, 8]} />
                    <meshStandardMaterial map={woodMap} color="#3E2723" />
                </mesh>
                {/* Glowing Flame */}
                <mesh ref={flameRef} position={[0, 0.36, 0]}>
                    <coneGeometry args={[0.3, 0.62, 10]} />
                    <meshStandardMaterial
                        color="#FB923C"
                        emissive="#EA580C"
                        emissiveIntensity={dim < 1 ? 0.15 : 2.0}
                    />
                </mesh>
                {/* Iron Cooking Pot */}
                <mesh position={[0, 0.56, 0]} castShadow>
                    <sphereGeometry args={[0.24, 12, 10]} />
                    <meshStandardMaterial color="#18181B" metalness={0.65} roughness={0.4} />
                </mesh>
                {!lowQuality && dim === 1 && (
                    <pointLight position={[0, 0.6, 0]} color="#FB923C" intensity={2.4} distance={6} />
                )}
            </group>

            {/* Tied Burlap Loot Sacks & Wooden Treasure Chest */}
            <group position={[-1.65, 0, -1.35]}>
                <mesh position={[0, 0.34, 0]} scale={[1, 1.15, 0.9]} castShadow>
                    <sphereGeometry args={[0.34, 12, 10]} />
                    <meshStandardMaterial color="#D6C3A5" roughness={0.92} />
                </mesh>
                <mesh position={[0, 0.68, 0]}>
                    <cylinderGeometry args={[0.14, 0.08, 0.14, 10]} />
                    <meshStandardMaterial color="#C2A882" roughness={0.9} />
                </mesh>
                <mesh position={[0.52, 0.26, -0.25]} scale={[1, 1.1, 0.9]} castShadow>
                    <sphereGeometry args={[0.26, 12, 10]} />
                    <meshStandardMaterial color="#C8B290" roughness={0.92} />
                </mesh>
            </group>
        </group>
    );
}

export { Mapa1CurfewDiorama, Mapa2KuwartelDiorama, Mapa3KaritonDiorama, Mapa4KuboDiorama, Mapa5ForestDiorama };
