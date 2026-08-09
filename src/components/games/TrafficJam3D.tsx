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
            position={[data.x - 3, 0.4, data.z - 3]}
            rotation={[0, data.orientation === 'HORIZONTAL' ? Math.PI / 2 : 0, 0]}
            onClick={handleClick}
        >
            <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
                {/* Car Body */}
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.8, 0.6, data.length - 0.2]} />
                    <meshStandardMaterial color={data.color} metalness={0.6} roughness={0.2} />
                </mesh>
                {/* Windshield */}
                <mesh position={[0, 0.2, (data.length/2) - 0.5]} castShadow>
                    <boxGeometry args={[0.7, 0.4, 0.1]} />
                    <meshStandardMaterial color="#000000" />
                </mesh>
                {/* Wheels */}
                {[-(data.length/2) + 0.5, (data.length/2) - 0.5].map((pos, i) => (
                    <group key={i} position={[0, -0.3, pos]}>
                        <mesh position={[-0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                            <meshStandardMaterial color="#222222" />
                        </mesh>
                        <mesh position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                            <meshStandardMaterial color="#222222" />
                        </mesh>
                    </group>
                ))}
            </Float>
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

            <Canvas shadows>
                <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={50} />
                <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} minDistance={5} maxDistance={15} />

                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Environment preset="city" />

                {/* Parking Lot Floor */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                    <planeGeometry args={[7, 7]} />
                    <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
                </mesh>

                {/* Grid Lines */}
                <gridHelper args={[6, 6, 0xffffff, 0x444444]} position={[0, 0.01, 0]} />

                {/* Exit Markers */}
                <mesh position={[3.5, 0.02, 2.5]} rotation={[-Math.PI/2, 0, Math.PI/2]}>
                    <planeGeometry args={[1, 1]} />
                    <meshStandardMaterial color="#00FF00" transparent opacity={0.3} />
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
