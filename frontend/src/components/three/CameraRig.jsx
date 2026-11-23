import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { cameraOffset, getWalkHeight, MAP_NODE_STOPS, WORLD_SCALE } from './worldConfig';

const S = WORLD_SCALE;
const H = 1.6;

// First-visit fly-over (base positions scaled to the bigger world)
const FLYTHROUGH_WAYPOINTS = [
    { pos: [0, 22, 34], look: [0, 1, 2], mapIndex: 0 },
    { pos: [-27, 7.5, 21], look: [-24, 1.5, 13], mapIndex: 1 },
    { pos: [-14, 7.5, 11], look: [-11, 1.5, 2], mapIndex: 2 },
    { pos: [1, 7.5, 2], look: [2, 1.5, -8], mapIndex: 3 },
    { pos: [13, 7.5, 13], look: [14, 1.5, 4], mapIndex: 4 },
    { pos: [26, 8.5, 21], look: [25, 1.5, 12], mapIndex: 5 },
].map((w) => ({
    pos: new THREE.Vector3(w.pos[0] * S, w.pos[1] * H, w.pos[2] * S),
    look: new THREE.Vector3(w.look[0] * S, w.look[1] * H, w.look[2] * S),
    mapIndex: w.mapIndex,
}));

function standPoint(mapNumber) {
    const stop = MAP_NODE_STOPS[mapNumber] || MAP_NODE_STOPS[1];
    return new THREE.Vector3(stop.x, getWalkHeight(stop.x, stop.z) + 1.4, stop.z);
}

export default function CameraRig({
    controlsRef,
    tourActive,
    isWalking,
    startMapNumber,
    onTourCardChange,
    onTourFinish,
}) {
    const { camera, size } = useThree();
    const aspect = size.width / Math.max(1, size.height);
    const elapsedRef = useRef(0);
    const lastStageRef = useRef(0);
    const snappedInitialRef = useRef(false);
    const totalDuration = 13.5;

    useEffect(() => {
        if (!tourActive && !snappedInitialRef.current && controlsRef?.current) {
            const p = standPoint(startMapNumber);
            camera.position.copy(p).add(cameraOffset(aspect));
            controlsRef.current.target.copy(p);
            controlsRef.current.update();
            snappedInitialRef.current = true;
        }
    }, [tourActive, startMapNumber, camera, controlsRef]);

    useEffect(() => {
        if (tourActive) {
            elapsedRef.current = 0;
            lastStageRef.current = 0;
            onTourCardChange?.(0);
        }
    }, [tourActive]);

    useFrame((_, delta) => {
        if (!tourActive) return;

        elapsedRef.current += delta;
        const progress = Math.min(1, elapsedRef.current / totalDuration);

        const endLook = standPoint(startMapNumber);
        const endPos = endLook.clone().add(cameraOffset(aspect));
        const all = [...FLYTHROUGH_WAYPOINTS, { pos: endPos, look: endLook, mapIndex: 0 }];

        const scaled = progress * (all.length - 1);
        const idx = Math.min(all.length - 2, Math.floor(scaled));
        const localT = scaled - idx;
        const smoothT = localT * localT * (3 - 2 * localT);
        const from = all[idx];
        const to = all[idx + 1];

        camera.position.lerpVectors(from.pos, to.pos, smoothT);
        const look = new THREE.Vector3().lerpVectors(from.look, to.look, smoothT);
        if (controlsRef?.current) {
            controlsRef.current.target.copy(look);
            controlsRef.current.update();
        } else {
            camera.lookAt(look);
        }

        const card = to.mapIndex || from.mapIndex;
        if (card !== lastStageRef.current) {
            lastStageRef.current = card;
            onTourCardChange?.(card);
        }
        if (progress >= 1) {
            snappedInitialRef.current = true;
            onTourFinish?.();
        }
    });

    return (
        <OrbitControls
            ref={controlsRef}
            enabled={!tourActive && !isWalking}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.25}
            minPolarAngle={0.3}
            minDistance={8}
            maxDistance={aspect < 1 ? 95 : 70}
        />
    );
}
