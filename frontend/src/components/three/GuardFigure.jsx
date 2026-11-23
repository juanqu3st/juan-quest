import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Town guard / pulis / soldier standing at a map. Bigger than the pupil's character
 * (adult), rounded shapes, hands, boots, belt, badge and a peaked cap.
 * Optional lantern (Mapa 1: the pulis has an ilawan in the story).
 */
export default function GuardFigure({
    position,
    rotation = [0, 0, 0],
    scale = 1,
    uniformColor = '#1E3A8A',
    hatColor = '#1E293B',
    trimColor = '#FACC15',
    lantern = false,
    lowQuality = false,
}) {
    const bodyRef = useRef();
    const headRef = useRef();
    const seed = position[0] * 1.7 + position[2];

    useFrame(({ clock }) => {
        if (lowQuality) return;
        const t = clock.getElapsedTime() + seed;
        if (bodyRef.current) bodyRef.current.position.y = Math.sin(t * 1.6) * 0.012;
        if (headRef.current) headRef.current.rotation.y = Math.sin(t * 0.45) * 0.45;
    });

    const skin = '#C68A5E';
    return (
        <group position={position} rotation={rotation} scale={scale}>
            {/* soft contact shadow */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <circleGeometry args={[0.32, 20]} />
                <meshBasicMaterial color="#0F172A" transparent opacity={0.22} />
            </mesh>
            <group ref={bodyRef}>
                {/* boots */}
                {[-0.1, 0.1].map((x) => (
                    <mesh key={x} position={[x, 0.06, 0.03]} scale={[1, 0.75, 1.45]} castShadow>
                        <sphereGeometry args={[0.085, 14, 10]} />
                        <meshStandardMaterial color="#1C1917" roughness={0.4} />
                    </mesh>
                ))}
                {/* legs */}
                {[-0.1, 0.1].map((x) => (
                    <mesh key={x} position={[x, 0.32, 0]} castShadow>
                        <capsuleGeometry args={[0.075, 0.38, 6, 12]} />
                        <meshStandardMaterial color={uniformColor} roughness={0.75} />
                    </mesh>
                ))}
                {/* torso */}
                <mesh position={[0, 0.8, 0]} castShadow>
                    <capsuleGeometry args={[0.19, 0.34, 8, 16]} />
                    <meshStandardMaterial color={uniformColor} roughness={0.7} />
                </mesh>
                {/* belt + buckle */}
                <mesh position={[0, 0.6, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.07, 18]} />
                    <meshStandardMaterial color="#27272A" roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.6, 0.2]}>
                    <boxGeometry args={[0.07, 0.05, 0.02]} />
                    <meshStandardMaterial color={trimColor} metalness={0.7} roughness={0.3} />
                </mesh>
                {/* badge + buttons */}
                <mesh position={[0.09, 0.92, 0.18]} rotation={[0.15, 0, 0]}>
                    <cylinderGeometry args={[0.035, 0.035, 0.015, 6]} />
                    <meshStandardMaterial color={trimColor} metalness={0.7} roughness={0.3} />
                </mesh>
                {[0.72, 0.82, 0.92].map((y) => (
                    <mesh key={y} position={[0, y, 0.192]}>
                        <sphereGeometry args={[0.014, 8, 6]} />
                        <meshStandardMaterial color={trimColor} metalness={0.6} roughness={0.3} />
                    </mesh>
                ))}
                {/* arms + hands */}
                {[-1, 1].map((side) => (
                    <group key={side} position={[side * 0.25, 1.0, 0]} rotation={[0, 0, side * 0.1]}>
                        <mesh position={[0, -0.2, 0]} castShadow>
                            <capsuleGeometry args={[0.06, 0.3, 6, 10]} />
                            <meshStandardMaterial color={uniformColor} roughness={0.7} />
                        </mesh>
                        <mesh position={[0, -0.42, 0.01]} castShadow>
                            <sphereGeometry args={[0.065, 12, 10]} />
                            <meshStandardMaterial color={skin} roughness={0.55} />
                        </mesh>
                    </group>
                ))}
                {lantern && (
                    <group position={[0.29, 0.5, 0.06]}>
                        <mesh position={[0, 0.06, 0]}>
                            <torusGeometry args={[0.04, 0.008, 6, 12, Math.PI]} />
                            <meshStandardMaterial color="#1E293B" metalness={0.6} />
                        </mesh>
                        <mesh position={[0, -0.06, 0]}>
                            <cylinderGeometry args={[0.055, 0.065, 0.13, 8]} />
                            <meshStandardMaterial color="#FEF08A" emissive="#F59E0B" emissiveIntensity={1.6} />
                        </mesh>
                        <mesh position={[0, 0.015, 0]}>
                            <coneGeometry args={[0.07, 0.05, 8]} />
                            <meshStandardMaterial color="#1E293B" metalness={0.6} />
                        </mesh>
                    </group>
                )}
                {/* neck + head */}
                <mesh position={[0, 1.13, 0]}>
                    <cylinderGeometry args={[0.07, 0.08, 0.08, 12]} />
                    <meshStandardMaterial color={skin} roughness={0.55} />
                </mesh>
                <group ref={headRef} position={[0, 1.3, 0]}>
                    <mesh castShadow scale={[1, 1.06, 0.98]}>
                        <sphereGeometry args={[0.17, 20, 16]} />
                        <meshStandardMaterial color={skin} roughness={0.5} />
                    </mesh>
                    {/* ears */}
                    {[-1, 1].map((side) => (
                        <mesh key={side} position={[side * 0.168, -0.01, 0]} scale={[0.5, 1, 0.8]}>
                            <sphereGeometry args={[0.04, 10, 8]} />
                            <meshStandardMaterial color={skin} roughness={0.55} />
                        </mesh>
                    ))}
                    {/* eyes (round, with shine) */}
                    {[-0.058, 0.058].map((x) => (
                        <group key={x} position={[x, 0.01, 0.152]}>
                            <mesh scale={[1, 1, 0.6]}>
                                <sphereGeometry args={[0.028, 14, 10]} />
                                <meshStandardMaterial color="#FFFFFF" roughness={0.2} />
                            </mesh>
                            <mesh position={[0, 0, 0.014]} scale={[1, 1, 0.5]}>
                                <sphereGeometry args={[0.018, 12, 8]} />
                                <meshStandardMaterial color="#2B1A10" roughness={0.15} />
                            </mesh>
                            <mesh position={[-0.007, 0.008, 0.024]}>
                                <sphereGeometry args={[0.005, 6, 6]} />
                                <meshBasicMaterial color="#FFFFFF" />
                            </mesh>
                        </group>
                    ))}
                    {/* brows + moustache (adult) */}
                    {[-0.058, 0.058].map((x) => (
                        <mesh key={x} position={[x, 0.058, 0.152]} rotation={[0, 0, x > 0 ? -0.15 : 0.15]}>
                            <boxGeometry args={[0.05, 0.012, 0.012]} />
                            <meshStandardMaterial color="#1A100B" />
                        </mesh>
                    ))}
                    <mesh position={[0, -0.06, 0.158]} scale={[1.6, 0.45, 0.6]}>
                        <sphereGeometry args={[0.03, 10, 8]} />
                        <meshStandardMaterial color="#1A100B" roughness={0.6} />
                    </mesh>
                    <mesh position={[0, -0.025, 0.168]}>
                        <sphereGeometry args={[0.018, 8, 8]} />
                        <meshStandardMaterial color="#B07450" roughness={0.55} />
                    </mesh>
                    {/* peaked cap */}
                    <mesh position={[0, 0.12, -0.005]} castShadow>
                        <cylinderGeometry args={[0.19, 0.175, 0.1, 20]} />
                        <meshStandardMaterial color={hatColor} roughness={0.5} />
                    </mesh>
                    <mesh position={[0, 0.17, -0.005]}>
                        <cylinderGeometry args={[0.2, 0.19, 0.02, 20]} />
                        <meshStandardMaterial color={hatColor} roughness={0.5} />
                    </mesh>
                    <mesh position={[0, 0.085, 0.15]} rotation={[0.32, 0, 0]}>
                        <boxGeometry args={[0.24, 0.018, 0.13]} />
                        <meshStandardMaterial color="#09090B" roughness={0.35} />
                    </mesh>
                    <mesh position={[0, 0.13, 0.172]}>
                        <cylinderGeometry args={[0.026, 0.026, 0.012, 6]} />
                        <meshStandardMaterial color={trimColor} metalness={0.7} roughness={0.3} />
                    </mesh>
                </group>
            </group>
        </group>
    );
}
