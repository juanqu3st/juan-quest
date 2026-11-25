import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

class GuardErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}

/**
 * Standing Barrio Pulis / Kuwartel Guwardya NPC rendered using our Pixar v2 rigged GLB models
 * (`/models/pulis.glb` & `/models/guwardya.glb`), with gentle guard idle breathing, slow watch
 * look-around, and Mapa 1's glowing barrio lantern ("ilawan").
 */
export default function GuardFigure({
    position,
    rotation = [0, 0, 0],
    scale = 1,
    guardType,
    uniformColor = '#1E3A8A',
    hatColor = '#1E293B',
    trimColor = '#FACC15',
    lantern = false,
    lowQuality = false,
}) {
    const resolvedType =
        guardType || (String(uniformColor).toLowerCase() === '#3f6212' ? 'guwardya' : 'pulis');
    const modelUrl = resolvedType === 'guwardya' ? '/models/guwardya.glb' : '/models/pulis.glb';
    const seed = position[0] * 1.7 + position[2];

    const fallback = (
        <LegacyGuardFallback
            uniformColor={uniformColor}
            hatColor={hatColor}
            trimColor={trimColor}
            lantern={lantern}
        />
    );

    return (
        <group position={position} rotation={rotation} scale={scale}>
            {/* Soft grounded contact shadow */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
                <circleGeometry args={[0.36, 20]} />
                <meshBasicMaterial color="#0F172A" transparent opacity={0.24} depthWrite={false} />
            </mesh>

            <GuardErrorBoundary key={modelUrl} fallback={fallback}>
                <Suspense fallback={fallback}>
                    <PixarGuardGlb
                        url={modelUrl}
                        lantern={lantern}
                        seed={seed}
                        lowQuality={lowQuality}
                    />
                </Suspense>
            </GuardErrorBoundary>
        </group>
    );
}

function PixarGuardGlb({ url, lantern, seed, lowQuality }) {
    const { scene } = useGLTF(url, '/draco/');
    const model = useMemo(() => cloneSkinned(scene), [scene]);

    const rig = useMemo(() => {
        const canonical = (s) => (s || '').replace(/[._\-\s]/g, '').toLowerCase();
        const wanted = new Set([
            'spine',
            'chest',
            'head',
            'upperarml',
            'forearml',
            'upperarmr',
            'forearmr',
        ]);
        const bones = {};
        const restQ = {};

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = !lowQuality;
                child.receiveShadow = true;
            }
            const key = canonical(child.name);
            if ((child.isBone || child.type === 'Bone') && wanted.has(key) && !bones[key]) {
                bones[key] = child;
                restQ[key] = child.quaternion.clone();
            }
        });

        return { bones, restQ };
    }, [model, lowQuality]);

    const animRef = useRef({
        euler: new THREE.Euler(0, 0, 0, 'XYZ'),
        quat: new THREE.Quaternion(),
    });

    useFrame(({ clock }) => {
        if (lowQuality) return;
        const { bones, restQ } = rig;
        const { euler, quat } = animRef.current;
        const t = clock.getElapsedTime() + seed;
        const breath = Math.sin(t * 1.75);

        const applyBone = (key, rx, ry = 0, rz = 0) => {
            const b = bones[key];
            const base = restQ[key];
            if (!b || !base) return;
            euler.set(rx, ry, rz);
            quat.setFromEuler(euler);
            b.quaternion.copy(base).multiply(quat);
        };

        applyBone('spine', breath * 0.022, 0, 0);
        applyBone('head', breath * 0.02, Math.sin(t * 0.48) * 0.34, 0);

        if (lantern) {
            // Hold glowing lantern forward with left hand (viewer's right)
            applyBone('upperarml', -0.58 + breath * 0.02, 0.06, -0.10);
            applyBone('forearml', -0.52);
            applyBone('upperarmr', -0.06 + breath * 0.02, 0, 0.06);
            applyBone('forearmr', -0.16);
        } else {
            // Crisp alert standing guard posture
            applyBone('upperarml', -0.06 + breath * 0.02, 0, -0.06);
            applyBone('forearml', -0.16);
            applyBone('upperarmr', -0.06 - breath * 0.02, 0, 0.06);
            applyBone('forearmr', -0.16);
        }
    });

    // Adult stature matching Munisipyo/Kuwartel doorways cleanly (~1.14 * 1.09 * 1.92 = ~2.39 world scale)
    return (
        <group>
            <primitive object={model} scale={1.14} position={[0, 0.02, 0]} />
            {lantern && (
                <group position={[0.22, 0.48, 0.25]} scale={1.08}>
                    <mesh position={[0, 0.065, 0]}>
                        <torusGeometry args={[0.042, 0.008, 6, 12, Math.PI]} />
                        <meshStandardMaterial color="#1E293B" metalness={0.6} roughness={0.35} />
                    </mesh>
                    <mesh position={[0, -0.06, 0]}>
                        <cylinderGeometry args={[0.056, 0.066, 0.135, 8]} />
                        <meshStandardMaterial color="#FEF08A" emissive="#F59E0B" emissiveIntensity={1.65} />
                    </mesh>
                    <mesh position={[0, 0.018, 0]}>
                        <coneGeometry args={[0.072, 0.05, 8]} />
                        <meshStandardMaterial color="#1E293B" metalness={0.6} roughness={0.35} />
                    </mesh>
                </group>
            )}
        </group>
    );
}

/** Lightweight geometric fallback while GLB streams or if WebGL cannot decode. */
function LegacyGuardFallback({ uniformColor, hatColor, trimColor, lantern }) {
    const skin = '#C68A5E';
    return (
        <group>
            {[-0.1, 0.1].map((x) => (
                <mesh key={x} position={[x, 0.32, 0]}>
                    <capsuleGeometry args={[0.075, 0.38, 6, 10]} />
                    <meshStandardMaterial color={uniformColor} roughness={0.75} />
                </mesh>
            ))}
            <mesh position={[0, 0.8, 0]}>
                <capsuleGeometry args={[0.19, 0.34, 8, 12]} />
                <meshStandardMaterial color={uniformColor} roughness={0.7} />
            </mesh>
            <mesh position={[0, 1.3, 0]}>
                <sphereGeometry args={[0.17, 14, 12]} />
                <meshStandardMaterial color={skin} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.42, -0.005]}>
                <cylinderGeometry args={[0.19, 0.175, 0.1, 14]} />
                <meshStandardMaterial color={hatColor} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.43, 0.17]}>
                <cylinderGeometry args={[0.026, 0.026, 0.012, 6]} />
                <meshStandardMaterial color={trimColor} metalness={0.7} roughness={0.3} />
            </mesh>
            {lantern && (
                <mesh position={[0.29, 0.44, 0.06]}>
                    <cylinderGeometry args={[0.055, 0.065, 0.13, 8]} />
                    <meshStandardMaterial color="#FEF08A" emissive="#F59E0B" emissiveIntensity={1.6} />
                </mesh>
            )}
        </group>
    );
}

useGLTF.preload('/models/pulis.glb', '/draco/');
useGLTF.preload('/models/guwardya.glb', '/draco/');
