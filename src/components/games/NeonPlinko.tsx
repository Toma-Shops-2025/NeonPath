import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '@/lib/audio';

interface Ball {
    id: number;
    x: number;
    y: number;
    color: string;
}

const NEON_COLORS = ['#FF00FF', '#00FF00', '#FFFF00', '#00FFFF', '#FF8000'];

export default function NeonPlinko({ onReward }: { onReward: (amt: number) => void }) {
    const [balls, setBall] = useState<Ball[]>([]);
    const [score, setScore] = useState(0);
    const canvasRef = useRef<HTMLDivElement>(null);

    const dropBall = () => {
        music.start();
        const newBall = {
            id: Date.now(),
            x: 50 + (Math.random() * 4 - 2), // Drop near center
            y: 0,
            color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)]
        };
        setBall(prev => [...prev, newBall]);
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-between p-4">
            <div className="text-center mb-4">
                <h2 className="text-3xl font-black text-white italic tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">NEON PLINKO</h2>
                <p className="text-[#00FFFF] font-bold text-sm uppercase tracking-widest">Score: {score}</p>
            </div>

            <div ref={canvasRef} className="relative w-full max-w-md aspect-[4/6] bg-black/40 backdrop-blur-md rounded-[2rem] border-4 border-[#00FFFF]/30 overflow-hidden shadow-[0_0_30px_rgba(0,255,255,0.1)]">
                {/* Pegs Grid */}
                <div className="absolute inset-0 p-8 grid grid-cols-7 grid-rows-9 gap-4">
                    {[...Array(63)].map((_, i) => (
                        <div key={i} className="w-2 h-2 bg-white/20 rounded-full shadow-[0_0_5px_white]" />
                    ))}
                </div>

                {/* Animated Balls */}
                <AnimatePresence>
                    {balls.map(ball => (
                        <motion.div
                            key={ball.id}
                            initial={{ top: "-5%", left: `${ball.x}%` }}
                            animate={{
                                top: "105%",
                                left: [`${ball.x}%`, `${ball.x + 10}%`, `${ball.x - 5}%`, `${ball.x + 2}%`],
                            }}
                            transition={{ duration: 3, ease: "easeIn" }}
                            onAnimationComplete={() => {
                                setScore(s => s + 10);
                                onReward(0.01);
                                setBall(prev => prev.filter(b => b.id !== ball.id));
                            }}
                            className="absolute w-5 h-5 rounded-full shadow-lg z-20"
                            style={{ backgroundColor: ball.color, boxShadow: `0 0 15px ${ball.color}` }}
                        />
                    ))}
                </AnimatePresence>

                {/* Multipliers at bottom */}
                <div className="absolute bottom-0 w-full h-12 flex justify-around items-center border-t border-[#00FFFF]/20 bg-black/40 backdrop-blur-sm">
                    {['2x', '1x', '5x', '1x', '2x'].map((m, i) => (
                        <span key={i} className="text-[10px] font-black text-white/50">{m}</span>
                    ))}
                </div>
            </div>

            <button
                onClick={dropBall}
                className="mt-8 bg-[#00FFFF] text-black px-12 py-5 rounded-full font-black text-xl shadow-[0_0_20px_rgba(0,255,255,0.5)] active:scale-95 transition-transform uppercase tracking-tighter italic"
            >
                Drop Ball
            </button>
        </div>
    );
}
