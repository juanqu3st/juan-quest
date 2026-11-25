import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, Sky } from '@react-three/drei';
import { RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { getDeviceProfile } from '../../utils/deviceTier';
import { createWorldCurve, WORLD_SCALE } from './worldConfig';
import TerrainAndWater from './TerrainAndWater';
import SteppingStonePath from './SteppingStonePath';
import CameraRig from './CameraRig';
import PlayerCharacter from './PlayerCharacter';
import MapLandmarkNode from './MapLandmarkNode';
import EnvironmentInstanced from './EnvironmentInstanced';
import PinoyBarrioProps from './PinoyBarrioProps';
import BarrioLivingWorld from './BarrioLivingWorld';
import PahingahanNode from './PahingahanNode';

export default function WorldMapCanvas({
    maps = [],
    characterKey,
    currentMapNumber,
    startMapNumber,
    targetMapNumber,
    isWalking,
    isResting = false,
    allMapsCompleted = false,
    tourActive,
    guideStep = null,
    isSessionWaiting = false,
    hideScores = false,
    openedMapIds,
    unlockingMapId = null,
    lockScreenProjectorRef,
    paused = false,
    onEnterMap,
    onSelectPahingahan,
    onArrived,
    onTourCardChange,
    onTourFinish,
}) {
    const device = useMemo(() => getDeviceProfile(), []);
    const isMobileDevice = device.isMobile;
    const isLowEndDevice = device.isLowEnd;

    const [quality, setQuality] = useState(() => (isLowEndDevice ? 'low' : 'balanced'));
    const [contextLost, setContextLost] = useState(false);
    const [canvasKey, setCanvasKey] = useState(0);
    const controlsRef = useRef();
    const playerPosRef = useRef(new THREE.Vector3());
    const glCleanupRef = useRef(null);
    const curve = useMemo(() => createWorldCurve(), []);
    const lowQuality = quality === 'low';
    const S = WORLD_SCALE;
    const shadowSize = isMobileDevice ? 512 : 1024;
    // Scalar DPR in lowQuality guarantees genuine pixel reduction (vs [0.75, 1] clamping to 1.0 on 2x-3x budget phones!)
    const activeDpr = lowQuality
        ? guideStep !== null
            ? 0.6
            : 0.72
        : isMobileDevice
          ? [1, 1.25]
          : [1, 1.5];

    useEffect(() => {
        return () => {
            glCleanupRef.current?.();
            glCleanupRef.current = null;
        };
    }, []);

    const handleCanvasCreated = useCallback(({ gl }) => {
        glCleanupRef.current?.();
        const dom = gl.domElement;
        if (!dom) return;

        const onLost = (e) => {
            e.preventDefault();
            setContextLost(true);
        };
        const onRestored = () => {
            setContextLost(false);
        };

        dom.addEventListener('webglcontextlost', onLost, false);
        dom.addEventListener('webglcontextrestored', onRestored, false);
        glCleanupRef.current = () => {
            dom.removeEventListener('webglcontextlost', onLost, false);
            dom.removeEventListener('webglcontextrestored', onRestored, false);
        };
    }, []);

    const handleReload3D = () => {
        glCleanupRef.current?.();
        glCleanupRef.current = null;
        setContextLost(false);
        setCanvasKey((k) => k + 1);
    };

    return (
        <div className="relative w-full h-full">
            <Canvas
                key={canvasKey}
                onCreated={handleCanvasCreated}
                frameloop={paused ? 'never' : 'always'}
                shadows={!lowQuality}
                dpr={activeDpr}
                gl={{
                    antialias: !isLowEndDevice,
                    powerPreference: isMobileDevice ? 'default' : 'high-performance',
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
                shadow-mapSize-width={shadowSize}
                shadow-mapSize-height={shadowSize}
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
                    guideActive={guideStep !== null}
                    hideScores={hideScores}
                    lowQuality={lowQuality}
                />
            ))}

            <PinoyBarrioProps lowQuality={lowQuality} />
            {/* Skip heavy multi-part background crowd (~180 draw calls) in lowQuality so budget phones stay 50-60 FPS */}
            {!lowQuality && <BarrioLivingWorld lowQuality={false} />}

            <PahingahanNode
                characterKey={characterKey}
                allCompleted={allMapsCompleted}
                isResting={isResting}
                tourActive={tourActive}
                guideActive={guideStep !== null}
                lowQuality={lowQuality}
                onSelectPahingahan={onSelectPahingahan}
            />

            <PlayerCharacter
                characterKey={characterKey}
                curve={curve}
                startMapNumber={startMapNumber ?? currentMapNumber}
                targetMapNumber={targetMapNumber}
                isWalking={isWalking}
                isResting={isResting}
                tourActive={tourActive}
                lowQuality={lowQuality}
                controlsRef={controlsRef}
                playerPosRef={playerPosRef}
                onArrived={onArrived}
            />

            <EnvironmentInstanced lowQuality={lowQuality} playerPosRef={playerPosRef} tourActive={tourActive} />

            <CameraRig
                controlsRef={controlsRef}
                tourActive={tourActive}
                guideStep={guideStep}
                isWalking={isWalking}
                startMapNumber={startMapNumber ?? currentMapNumber}
                onTourCardChange={onTourCardChange}
                onTourFinish={onTourFinish}
            />
        </Canvas>

        {contextLost && (
            <div className="absolute inset-0 z-30 bg-[#FAF8F5]/95 flex items-center justify-center p-6">
                <div className="max-w-xs w-full bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-3.5 shadow-sm">
                    <h3 className="text-base font-bold text-stone-900">Napahinga ang 3D Mapa</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                        Pansamantalang huminto ang 3D display ng device. Pindutin sa ibaba upang ibalik agad ang mapa.
                    </p>
                    <button
                        type="button"
                        onClick={handleReload3D}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.99]"
                    >
                        <RotateCcw className="w-4 h-4" />
                        <span>I-reload ang 3D Mapa</span>
                    </button>
                </div>
            </div>
        )}
    </div>
    );
}
