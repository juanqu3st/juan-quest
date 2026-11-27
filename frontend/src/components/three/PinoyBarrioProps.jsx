import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BARRIO_ASKALS, BARRIO_KUBOS, BARRIO_TINDAHANS, getTerrainHeight } from './worldConfig';
import CameraFadeGroup from './CameraFadeGroup';

useGLTF.preload('/models/kubo_bg.glb', '/draco/');
useGLTF.preload('/models/tindahan.glb', '/draco/');
useGLTF.preload('/models/askal.glb', '/draco/');
useGLTF.preload('/models/askal_rest.glb', '/draco/');

class BarrioErrorBoundary extends React.Component {
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

function ClonedGlb({ url, position, yaw = 0, scale = 1, castShadow = true, animateDog = false, seed = 0 }) {
    const { scene } = useGLTF(url, '/draco/');
    const groupRef = useRef();

    const cloned = useMemo(() => {
        const c = scene.clone(true);
        c.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = castShadow;
                child.receiveShadow = true;
            }
        });
        return c;
    }, [scene, castShadow]);

    useFrame(({ clock }) => {
        if (!animateDog || !groupRef.current) return;
        const t = clock.getElapsedTime() + seed;
        // Playful gentle Pinoy askal breathing & head-wag sway
        groupRef.current.rotation.y = yaw + Math.sin(t * 2.2) * 0.08;
        groupRef.current.scale.set(scale, scale * (1 + Math.sin(t * 3.1) * 0.02), scale);
    });

    return (
        <group ref={groupRef} position={position} rotation={[0, yaw, 0]} scale={scale}>
            <primitive object={cloned} dispose={null} />
        </group>
    );
}

/**
 * Authentic Pinoy Barrio village life:
 * - 3 Roadside Sari-Sari Stores (Tindahan)
 * - 9 Scattered Background Bahay Kubo Huts across rolling hills (5 on low-end mobile)
 * - 4 Friendly Pinoy Askals (standing + napping in the shade)
 */
export default function PinoyBarrioProps({ lowQuality, playerPosRef, tourActive = false }) {
    const kubos = lowQuality ? BARRIO_KUBOS.slice(0, 5) : BARRIO_KUBOS;

    return (
        <BarrioErrorBoundary>
            <Suspense fallback={null}>
                <group>
                    {/* Roadside Pinoy Sari-Sari Stores (Tindahan) — fade cleanly when blocking camera */}
                    {BARRIO_TINDAHANS.map((st, idx) => (
                        <CameraFadeGroup
                            key={`tindahan-${idx}`}
                            playerPosRef={playerPosRef}
                            tourActive={tourActive}
                            pad={0.55}
                            lensMargin={1.8}
                        >
                            <ClonedGlb
                                url="/models/tindahan.glb"
                                position={[st.x, getTerrainHeight(st.x, st.z), st.z]}
                                yaw={st.yaw}
                                scale={st.scale}
                                castShadow={!lowQuality}
                            />
                        </CameraFadeGroup>
                    ))}

                    {/* Scattered Hillside & Valley Background Bahay Kubo Huts — fade cleanly when blocking camera */}
                    {kubos.map((kb, idx) => (
                        <CameraFadeGroup
                            key={`kubo-${idx}`}
                            playerPosRef={playerPosRef}
                            tourActive={tourActive}
                            pad={0.55}
                            lensMargin={1.8}
                        >
                            <ClonedGlb
                                url="/models/kubo_bg.glb"
                                position={[kb.x, getTerrainHeight(kb.x, kb.z), kb.z]}
                                yaw={kb.yaw}
                                scale={kb.scale}
                                castShadow={!lowQuality}
                            />
                        </CameraFadeGroup>
                    ))}

                    {/* Friendly Pinoy Askals (Standing + Napping near Tindahans & Kubos) */}
                    {BARRIO_ASKALS.map((dog, idx) => (
                        <ClonedGlb
                            key={`askal-${idx}`}
                            url={dog.resting ? '/models/askal_rest.glb' : '/models/askal.glb'}
                            position={[dog.x, getTerrainHeight(dog.x, dog.z), dog.z]}
                            yaw={dog.yaw}
                            scale={dog.scale}
                            castShadow={!lowQuality}
                            animateDog={!lowQuality && !dog.resting}
                            seed={idx * 2.1}
                        />
                    ))}
                </group>
            </Suspense>
        </BarrioErrorBoundary>
    );
}
