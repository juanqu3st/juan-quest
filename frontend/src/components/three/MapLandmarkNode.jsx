import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getTerrainHeight, MAP_NODE_STOPS } from './worldConfig';
import GuardFigure from './GuardFigure';
import MapLabelSprite from './MapLabelSprite';

for (let m = 1; m <= 5; m++) {
    useGLTF.preload(`/models/map${m}.glb`, '/draco/');
}

/**
 * Per-map architectural & guard layout directly on the natural Pinoy meadow / packed-earth clearing
 * (no concrete platforms!). Every building and guard sits clear of Juan (0, 0) and the dirt road.
 */
const LANDMARK_LAYOUT = {
    1: {
        offset: [-2.4, -4.1],
        yaw: 0.16,
        scale: 1.48,
        guards: [
            // Original Mapa 1 Pulis Guard with glowing lantern, standing clear beside the Munisipyo/notice board (off the dirt road!)
            { pos: [1.55, 0, -4.45], rot: [0, 0.25, 0], uniformColor: '#1E3A8A', hatColor: '#1E293B', lantern: true },
        ],
    },
    2: {
        offset: [-2.6, -3.5],
        yaw: 0.62,
        scale: 1.50,
        guards: [
            // Original Mapa 2 Twin Military Guwardiya flanking Kuwartel entrance
            { pos: [-4.6, 0, -0.6], rot: [0, 0.72, 0], uniformColor: '#3F6212', hatColor: '#365314', lantern: false },
            { pos: [0.6, 0, -4.6], rot: [0, 0.45, 0], uniformColor: '#3F6212', hatColor: '#365314', lantern: false },
        ],
    },
    3: {
        offset: [0.2, -3.6],
        yaw: 0.0,
        scale: 1.48,
        guards: [
            // Original Mapa 3 Roadside Pulis Guard beside milestone
            { pos: [-3.6, 0, -1.8], rot: [0, 0.45, 0], uniformColor: '#1E3A8A', hatColor: '#1E293B', lantern: false },
        ],
    },
    4: {
        offset: [2.8, -3.7],
        yaw: -0.50,
        scale: 1.42,
        guards: [],
    },
    5: {
        offset: [0.4, -4.0],
        yaw: -0.12,
        scale: 1.48,
        guards: [],
    },
};

class LandmarkErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

export default function MapLandmarkNode({
    map,
    currentMapNumber,
    isSessionWaiting = false,
    hasBeenOpened = false,
    isUnlocking = false,
    lockScreenProjectorRef,
    onEnterMap,
    tourActive,
    lowQuality,
}) {
    const stop = MAP_NODE_STOPS[map.map_number];
    const lockRef = useRef();
    const { camera, gl } = useThree();

    const isCompleted = Boolean(map.progress?.is_completed);
    const isUnlocked = map.map_number <= currentMapNumber || Boolean(map.is_unlocked);
    const showRoofPadlock = !isUnlocking && (isSessionWaiting || !isUnlocked || (!hasBeenOpened && !isCompleted));
    const isReadyToOpen = !isSessionWaiting && isUnlocked && !hasBeenOpened && !isCompleted;
    const labelState = isCompleted ? 'done' : !isSessionWaiting && isUnlocked ? 'open' : 'locked';

    const layout = LANDMARK_LAYOUT[map.map_number] || {
        offset: [0, -3.5],
        yaw: 0,
        scale: 1.45,
        guards: [],
    };

    const groundY = stop ? getTerrainHeight(stop.x, stop.z) : 0;

    // Register a live 3D -> 2D screen coordinate projector for this building's roof padlock
    useEffect(() => {
        if (!lockScreenProjectorRef?.current || !stop) return undefined;
        const mapNum = map.map_number;
        const projectLockToScreen = () => {
            const worldPos = new THREE.Vector3();
            if (lockRef.current) {
                lockRef.current.getWorldPosition(worldPos);
            } else {
                worldPos.set(stop.x + layout.offset[0], groundY + 6.85, stop.z + layout.offset[1]);
            }
            worldPos.project(camera);
            const rect = gl.domElement.getBoundingClientRect();
            return {
                x: rect.left + ((worldPos.x + 1) / 2) * rect.width,
                y: rect.top + ((-worldPos.y + 1) / 2) * rect.height,
            };
        };
        lockScreenProjectorRef.current.set(mapNum, projectLockToScreen);
        return () => {
            if (lockScreenProjectorRef.current?.get(mapNum) === projectLockToScreen) {
                lockScreenProjectorRef.current.delete(mapNum);
            }
        };
    }, [lockScreenProjectorRef, stop, map.map_number, layout.offset, groundY, camera, gl]);

    useFrame(({ clock }) => {
        if (lockRef.current && showRoofPadlock && !lowQuality) {
            const t = clock.getElapsedTime();
            const bobSpeed = isReadyToOpen ? 3.2 : 2.1;
            const bobAmp = isReadyToOpen ? 0.28 : 0.2;
            const spinSpeed = isReadyToOpen ? 1.1 : 0.65;
            lockRef.current.position.y = 6.85 + Math.sin(t * bobSpeed) * bobAmp;
            lockRef.current.rotation.y = t * spinSpeed;
        }
    });

    if (!stop) return null;

    const score = map.progress?.score ?? 0;

    return (
        <group
            position={[stop.x, groundY, stop.z]}
            onClick={(e) => {
                e.stopPropagation();
                const screenOrigin = lockScreenProjectorRef?.current?.get(map.map_number)?.();
                onEnterMap?.(map, screenOrigin);
            }}
        >
            {/* Invisible generous tap hitbox on the natural clearing for easy mobile tapping */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, -1.5]} visible={false}>
                <circleGeometry args={[7.2, 16]} />
                <meshBasicMaterial />
            </mesh>

            {/* Locked / Unopened 3D Bright-Yellow Padlock floating visibly above building */}
            {showRoofPadlock && (
                <group ref={lockRef} position={[layout.offset[0], 6.85, layout.offset[1]]} scale={1.85}>
                    {/* Vibrant golden-yellow padlock body (low metalness + emissive so it stays bright yellow in any lighting) */}
                    <mesh castShadow={!lowQuality}>
                        <boxGeometry args={[0.88, 0.72, 0.38]} />
                        <meshStandardMaterial
                            color="#FACC15"
                            emissive="#EAB308"
                            emissiveIntensity={0.45}
                            metalness={0.2}
                            roughness={0.28}
                        />
                    </mesh>
                    {/* Crisp warm-amber trim bands top & bottom for strong silhouette contrast against bright sky */}
                    <mesh position={[0, 0.33, 0]}>
                        <boxGeometry args={[0.92, 0.08, 0.41]} />
                        <meshStandardMaterial color="#CA8A04" emissive="#A16207" emissiveIntensity={0.22} metalness={0.25} roughness={0.35} />
                    </mesh>
                    <mesh position={[0, -0.33, 0]}>
                        <boxGeometry args={[0.92, 0.08, 0.41]} />
                        <meshStandardMaterial color="#CA8A04" emissive="#A16207" emissiveIntensity={0.22} metalness={0.25} roughness={0.35} />
                    </mesh>
                    {/* Bold keyhole emblem on BOTH front (+z) and back (-z) faces */}
                    {[0.195, -0.195].map((zPos, idx) => (
                        <group key={idx} position={[0, 0.02, zPos]}>
                            <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                <cylinderGeometry args={[0.11, 0.11, 0.04, 14]} />
                                <meshStandardMaterial color="#422006" roughness={0.5} />
                            </mesh>
                            <mesh position={[0, -0.1, 0]}>
                                <boxGeometry args={[0.11, 0.24, 0.04]} />
                                <meshStandardMaterial color="#422006" roughness={0.5} />
                            </mesh>
                        </group>
                    ))}
                    {/* Thick bright-yellow U-shackle arch + vertical legs seated cleanly into lock body */}
                    <mesh position={[0, 0.44, 0]}>
                        <torusGeometry args={[0.25, 0.088, 12, 20, Math.PI]} />
                        <meshStandardMaterial
                            color="#FEF08A"
                            emissive="#FACC15"
                            emissiveIntensity={0.35}
                            metalness={0.3}
                            roughness={0.22}
                        />
                    </mesh>
                    <mesh position={[-0.25, 0.39, 0]}>
                        <cylinderGeometry args={[0.088, 0.088, 0.16, 12]} />
                        <meshStandardMaterial
                            color="#FEF08A"
                            emissive="#FACC15"
                            emissiveIntensity={0.35}
                            metalness={0.3}
                            roughness={0.22}
                        />
                    </mesh>
                    <mesh position={[0.25, 0.39, 0]}>
                        <cylinderGeometry args={[0.088, 0.088, 0.16, 12]} />
                        <meshStandardMaterial
                            color="#FEF08A"
                            emissive="#FACC15"
                            emissiveIntensity={0.35}
                            metalness={0.3}
                            roughness={0.22}
                        />
                    </mesh>
                </group>
            )}

            {/* Main Architectural Landmark Grounded Directly on the Natural Pinoy Clearing */}
            <group
                position={[layout.offset[0], 0.01, layout.offset[1]]}
                rotation={[0, layout.yaw, 0]}
                scale={layout.scale}
            >
                <LandmarkErrorBoundary>
                    <Suspense fallback={null}>
                        <ArchitecturalLandmarkGlb
                            mapNumber={map.map_number}
                            isUnlocked={isUnlocked}
                            lowQuality={lowQuality}
                        />
                    </Suspense>
                </LandmarkErrorBoundary>

                {map.map_number === 1 && !lowQuality && isUnlocked && (
                    <pointLight position={[-1.69, 2.55, 1.12]} color="#FDE68A" intensity={2.4} distance={14} />
                )}
                {map.map_number === 2 && <AnimatedGarrisonFlag isUnlocked={isUnlocked} />}
                {map.map_number === 5 && (
                    <AnimatedCampfireFlame isUnlocked={isUnlocked} lowQuality={lowQuality} />
                )}
            </group>

            {/* Restored Original Adult Guard NPCs (Mapa 1 Pulis, Mapa 2 Twin Guwardiya, Mapa 3 Pulis) */}
            {layout.guards.map((g, idx) => (
                <GuardFigure
                    key={idx}
                    position={g.pos}
                    rotation={g.rot}
                    scale={1.92}
                    uniformColor={g.uniformColor}
                    hatColor={g.hatColor}
                    lantern={g.lantern}
                    lowQuality={lowQuality}
                />
            ))}

            {/* Ultra-Lightweight GPU Canvas Sprite Signboard (Zero DOM overhead for low-end mobile!) */}
            {!tourActive && (
                <MapLabelSprite
                    title={`Mapa ${map.map_number}: ${map.title}`}
                    state={labelState}
                    score={score}
                    maxScore={map.perfect_score ?? 10}
                    position={[layout.offset[0], showRoofPadlock ? 9.35 : 8.2, layout.offset[1]]}
                    height={1.45}
                />
            )}
        </group>
    );
}

function ArchitecturalLandmarkGlb({ mapNumber, isUnlocked, lowQuality }) {
    const { scene } = useGLTF(`/models/map${mapNumber}.glb`, '/draco/');

    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);
        clone.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = !lowQuality;
                child.receiveShadow = true;
                if (!isUnlocked && child.material) {
                    const mat = child.material.clone();
                    if (mat.color) mat.color.multiplyScalar(0.76);
                    child.material = mat;
                }
            }
        });
        return clone;
    }, [scene, isUnlocked, lowQuality]);

    useEffect(() => {
        return () => {
            clonedScene.traverse((child) => {
                if (child.isMesh && !isUnlocked && child.material) {
                    child.material.dispose?.();
                }
            });
        };
    }, [clonedScene, isUnlocked]);

    return <primitive object={clonedScene} />;
}

function AnimatedGarrisonFlag({ isUnlocked }) {
    const flagRef = useRef();
    useFrame(({ clock }) => {
        if (flagRef.current) {
            flagRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 3.8) * 0.24;
        }
    });

    return (
        <group ref={flagRef} position={[-1.38, 3.35, -0.32]}>
            <mesh position={[0.52, 0, 0]} castShadow>
                <boxGeometry args={[1.04, 0.56, 0.03]} />
                <meshStandardMaterial color={isUnlocked ? '#DC2626' : '#64748B'} roughness={0.62} />
            </mesh>
            <mesh position={[0.18, 0.14, 0.01]}>
                <boxGeometry args={[0.36, 0.28, 0.035]} />
                <meshStandardMaterial color={isUnlocked ? '#2563EB' : '#94A3B8'} roughness={0.62} />
            </mesh>
        </group>
    );
}

function AnimatedCampfireFlame({ isUnlocked, lowQuality }) {
    const flameRef = useRef();
    useFrame(({ clock }) => {
        if (flameRef.current && !lowQuality) {
            const s = 1 + Math.sin(clock.getElapsedTime() * 9.5) * 0.16;
            flameRef.current.scale.set(1, s, 1);
        }
    });

    return (
        <group position={[-0.88, 0.24, 0.45]}>
            <mesh ref={flameRef}>
                <coneGeometry args={[0.24, 0.52, 10]} />
                <meshStandardMaterial
                    color="#FB923C"
                    emissive="#EA580C"
                    emissiveIntensity={isUnlocked ? 2.1 : 0.2}
                />
            </mesh>
            {!lowQuality && isUnlocked && (
                <pointLight position={[0, 0.45, 0]} color="#FB923C" intensity={2.4} distance={14} />
            )}
        </group>
    );
}
