import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { createWorldCurve, WORLD_SCALE } from './worldConfig';
import TerrainAndWater from './TerrainAndWater';
import SteppingStonePath from './SteppingStonePath';
import CameraRig from './CameraRig';
import PlayerCharacter from './PlayerCharacter';
import MapLandmarkNode from './MapLandmarkNode';
import EnvironmentInstanced from './EnvironmentInstanced';
import PinoyBarrioProps from './PinoyBarrioProps';
import BarrioLivingWorld from './BarrioLivingWorld';

export default function WorldMapCanvas({
    maps = [],
    characterKey,
    currentMapNumber,
    startMapNumber,
    targetMapNumber,
    isWalking,
    tourActive,
    isSessionWaiting = false,
    openedMapIds,
    unlockingMapId = null,
    lockScreenProjectorRef,
    paused = false,
    onEnterMap,
    onArrived,
    onTourCardChange,
    onTourFinish,
}) {
    const [quality, setQuality] = useState('balanced');
    const controlsRef = useRef();
    const playerPosRef = useRef(new THREE.Vector3());
    const curve = useMemo(() => createWorldCurve(), []);
    const lowQuality = quality === 'low';
    const S = WORLD_SCALE;

    return (
        <Canvas
            frameloop={paused ? 'never' : 'always'}
            shadows={!lowQuality}
            dpr={lowQuality ? [0.75, 1] : [1, 1.5]}
            gl={{
                antialias: true,
                powerPreference: 'high-performance',
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.15,
            }}
            camera={{ position: [-28 * S, 16, 26 * S], fov: 44, near: 0.5, far: 560 }}
            className="w-full h-full"
        >
            <color attach="background" args={['#8CD0F2']} />
            <fog attach="fog" args={['#CDEAF7', 74 * S, 200 * S]} />

            {!lowQuality && (
                <Sky
                    distance={650}
                    sunPosition={[34 * S, 26 * S, 28 * S]}
                    turbidity={4.6}
                    rayleigh={1.2}
                    mieCoefficient={0.004}
                    mieDirectionalG={0.78}
                />
            )}

            <PerformanceMonitor
                bounds={() => [28, 55]}
                flipflops={2}
                onDecline={() => setQuality('low')}
                onIncline={() => setQuality('balanced')}
            />

            {/* Balanced Daylight 3-Point Rig so buildings are bright, warm, and never crushed black */}
            <ambientLight intensity={0.48} color="#FFFBF0" />
            <hemisphereLight args={['#FFFDF5', '#4D7C2E', 1.05]} />
            <directionalLight
                position={[34 * S, 46 * S, 32 * S]}
                intensity={1.65}
                color="#FFF7E6"
                castShadow={!lowQuality}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-left={-48 * S}
                shadow-camera-right={48 * S}
                shadow-camera-top={40 * S}
                shadow-camera-bottom={-40 * S}
                shadow-camera-far={240 * S}
                shadow-bias={-0.0004}
            />
            {/* Soft cool-warm front fill light eliminating black front-facade shadows */}
            <directionalLight position={[-30 * S, 24 * S, 38 * S]} intensity={0.55} color="#E0F2FE" />

            <TerrainAndWater lowQuality={lowQuality} />

            <SteppingStonePath curve={curve} maps={maps} lowQuality={lowQuality} />

            {maps.map((map) => (
                <MapLandmarkNode
                    key={map.id}
                    map={map}
                    currentMapNumber={currentMapNumber}
                    isSessionWaiting={isSessionWaiting}
                    hasBeenOpened={Boolean(openedMapIds?.has(map.id) || map.progress)}
                    isUnlocking={unlockingMapId === map.id}
                    lockScreenProjectorRef={lockScreenProjectorRef}
                    onEnterMap={onEnterMap}
                    tourActive={tourActive}
                    lowQuality={lowQuality}
                />
            ))}

            <PinoyBarrioProps lowQuality={lowQuality} />
            <BarrioLivingWorld lowQuality={lowQuality} />

            <PlayerCharacter
                characterKey={characterKey}
                curve={curve}
                startMapNumber={startMapNumber ?? currentMapNumber}
                targetMapNumber={targetMapNumber}
                isWalking={isWalking}
                tourActive={tourActive}
                controlsRef={controlsRef}
                playerPosRef={playerPosRef}
                onArrived={onArrived}
            />

            <EnvironmentInstanced lowQuality={lowQuality} playerPosRef={playerPosRef} tourActive={tourActive} />

            <CameraRig
                controlsRef={controlsRef}
                tourActive={tourActive}
                isWalking={isWalking}
                startMapNumber={startMapNumber ?? currentMapNumber}
                onTourCardChange={onTourCardChange}
                onTourFinish={onTourFinish}
            />
        </Canvas>
    );
}
