import React, { useState, useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float } from '@react-three/drei'
import * as THREE from 'three'
import { music } from '@/lib/audio'

type Orientation = 'HORIZONTAL' | 'VERTICAL'

interface VehicleData {
    id: number
    x: number
    z: number
    length: number
    orientation: Orientation
    color: string
    isEscaping?: boolean
}

const VEHICLE_TYPES = [
    { length: 2, color: '#FF00FF' }, // Pink Car
    { length: 2, color: '#00FFFF' }, // Cyan Car
    { length: 3, color: '#FFFF00' }, // Yellow Truck
    { length: 3, color: '#00FF00' }, // Green Truck
    { length: 2, color: '#FF3300' }, // Red Car
]

function Vehicle({ data, onMove, grid }: { data: VehicleData, onMove: (id: number) => void, grid: Set<string> }) {
    const meshRef = useRef<THREE.Group>(null)

    const handleClick = (e: any) => {
        e.stopPropagation()
        music.start()
        onMove(data.id)
    }

    return (
        <group
            position={[data.x - 3, 0.35, data.z - 3]}
            rotation={[0, data.orientation === 'HORIZONTAL' ? Math.PI / 2 : 0, 0]}
            onClick={handleClick}
        >
            {/* Low-Poly Car Body */}
            <group>
                {/* Main Chassis */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.85, 0.45, data.length - 0.15]} />
                    <meshStandardMaterial color={data.color} flatShading={true} metalness={0} roughness={0.5} />
                </mesh>

                {/* Cabin (Low-Poly Style) */}
                <mesh position={[0, 0.35, -0.1]} castShadow>
                    <boxGeometry args={[0.7, 0.3, data.length * 0.4]} />
                    <meshStandardMaterial color={data.color} flatShading={true} />
                </mesh>

                {/* Windows (Flat) */}
                <mesh position={[0, 0.35, 0]} castShadow>
                    <boxGeometry args={[0.72, 0.25, data.length * 0.38]} />
                    <meshStandardMaterial color="#111111" flatShading={true} />
                </mesh>

                {/* Blocky Headlights */}
                <mesh position={[0.3, 0, (data.length/2) - 0.1]}>
                    <boxGeometry args={[0.2, 0.15, 0.05]} />
                    <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={2} />
                </mesh>
                <mesh position={[-0.3, 0, (data.length/2) - 0.1]}>
                    <boxGeometry args={[0.2, 0.15, 0.05]} />
                    <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={2} />
                </mesh>

                {/* Blocky Wheels (Cylinders with few segments) */}
                {[-(data.length/2) + 0.45, (data.length/2) - 0.45].map((pos, i) => (
                    <group key={i} position={[0, -0.2, pos]}>
                        <mesh position={[-0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.18, 0.18, 0.15, 6]} />
                            <meshStandardMaterial color="#111111" flatShading={true} />
                        </mesh>
                        <mesh position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.18, 0.18, 0.15, 6]} />
                            <meshStandardMaterial color="#111111" flatShading={true} />
                        </mesh>
                    </group>
                ))}
            </group>
        </group>
    )
}

export default function TrafficJam3D({ onReward }: { onReward: (amt: number) => void }) {
    const [vehicles, setVehicles] = useState<VehicleData[]>([
        { id: 1, x: 2, z: 0, length: 2, orientation: 'VERTICAL', color: '#FF00FF' },
        { id: 2, x: 0, z: 2, length: 2, orientation: 'HORIZONTAL', color: '#00FFFF' },
        { id: 3, x: 4, z: 2, length: 3, orientation: 'VERTICAL', color: '#FFFF00' },
        { id: 4, x: 2, z: 5, length: 2, orientation: 'HORIZONTAL', color: '#00FF00' },
        { id: 5, x: 5, z: 0, length: 2, orientation: 'VERTICAL', color: '#FF3300' },
        { id: 6, x: 0, z: 4, length: 2, orientation: 'HORIZONTAL', color: '#9D00FF' },
    ])

    const grid = useMemo(() => {
        const occupied = new Set<string>()
        vehicles.forEach(v => {
            for (let i = 0; i < v.length; i++) {
                const x = v.orientation === 'HORIZONTAL' ? v.x + i : v.x
                const z = v.orientation === 'VERTICAL' ? v.z + i : v.z
                occupied.add(`${x},${z}`)
            }
        })
        return occupied
    }, [vehicles])

    const handleMove = (id: number) => {
        setVehicles(prev => {
            const v = prev.find(veh => veh.id === id)
            if (!v) return prev

            let nextX = v.x
            let nextZ = v.z

            // Try moving forward along orientation
            if (v.orientation === 'HORIZONTAL') nextX += 1
            else nextZ += 1

            // Boundary / Collision Check
            const isBlocked = () => {
                const headX = v.orientation === 'HORIZONTAL' ? v.x + v.length : v.x
                const headZ = v.orientation === 'VERTICAL' ? v.z + v.length : v.z

                // Exit logic: If it goes out of 6x6 grid
                if (headX >= 6 || headZ >= 6) return false

                return grid.has(`${headX},${headZ}`)
            }

            if (!isBlocked()) {
                // If it's leaving the board
                const finalX = v.orientation === 'HORIZONTAL' ? v.x + 1 : v.x
                const finalZ = v.orientation === 'VERTICAL' ? v.z + 1 : v.z

                if (finalX > 6 || finalZ > 6) {
                    onReward(0.05)
                    return prev.filter(veh => veh.id !== id)
                }

                return prev.map(veh => veh.id === id ? { ...veh, x: finalX, z: finalZ } : veh)
            }

            // Try moving backward if forward is blocked
            let backX = v.orientation === 'HORIZONTAL' ? v.x - 1 : v.x
            let backZ = v.orientation === 'VERTICAL' ? v.z - 1 : v.z

            if (backX >= 0 && backZ >= 0 && !grid.has(`${backX},${backZ}`)) {
                return prev.map(veh => veh.id === id ? { ...veh, x: backX, z: backZ } : veh)
            }

            return prev
        })
    }

    return (
        <div className="w-full h-full bg-slate-900 rounded-[2rem] overflow-hidden relative">
            <div className="absolute top-4 left-6 z-10">
                <h2 className="text-2xl font-black text-white italic tracking-tighter drop-shadow-md">NEON PARKING JAM 3D</h2>
                <p className="text-[#00FFFF] text-xs font-bold uppercase">Clear the lot to earn rewards</p>
            </div>

            <Canvas shadows gl={{ antialias: false }}>
                <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={45} />
                <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.3} minDistance={6} maxDistance={14} />

                <color attach="background" args={['#0a0a1a']} />
                <fog attach="fog" args={['#0a0a1a', 8, 20]} />

                <ambientLight intensity={0.6} />
                <directionalLight
                    position={[10, 15, 5]}
                    intensity={1.2}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                />

                <Environment preset="night" />

                {/* Parking Lot Floor */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                    <planeGeometry args={[10, 10]} />
                    <meshStandardMaterial color="#1a1a2a" roughness={1} flatShading={true} />
                </mesh>

                {/* Grid Dots instead of lines for a cleaner low-poly feel */}
                <group position={[0, 0.01, 0]}>
                    {Array.from({ length: 7 }).map((_, i) => (
                        Array.from({ length: 7 }).map((_, j) => (
                            <mesh key={`${i}-${j}`} position={[i - 3, 0, j - 3]}>
                                <boxGeometry args={[0.05, 0.01, 0.05]} />
                                <meshStandardMaterial color="#444466" />
                            </mesh>
                        ))
                    ))}
                </group>

                {/* Exit Gate Markers */}
                <mesh position={[3.5, 0, 2]} rotation={[-Math.PI/2, 0, 0]}>
                    <planeGeometry args={[0.2, 2]} />
                    <meshStandardMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={1.5} />
                </mesh>

                {vehicles.map(v => (
                    <Vehicle key={v.id} data={v} onMove={handleMove} grid={grid} />
                ))}

                <ContactShadows position={[0, -0.01, 0]} opacity={0.5} scale={10} blur={2} far={4.5} />
            </Canvas>

            <div className="absolute bottom-6 w-full text-center pointer-events-none">
                <span className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-full text-white/60 text-[10px] font-bold uppercase tracking-widest border border-white/10">
                    Tap vehicles to slide them
                </span>
            </div>
        </div>
    )
}
