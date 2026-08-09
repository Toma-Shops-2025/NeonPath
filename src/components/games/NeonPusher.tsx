import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { music } from '@/lib/audio';

interface Coin {
    id: number;
    x: number;
    y: number;
    color: string;
}

const NEON_COLORS = ['#FFD700', '#FF00FF', '#00FF00', '#00FFFF'];

export default function NeonPusher({ onReward }: { onReward: (amt: number) => void }) {
    const [coins, setCoins] = useState<Coin[]>([]);
    const [pushedCount, setPushedCount] = useState(0);

    const dropCoin = () => {
        music.start();
        const newCoin = {
            id: Date.now(),
            x: 20 + Math.random() * 60,
            y: 0,
            color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)]
        };
        setCoins(prev => [...prev, newCoin]);

        // Simulate pushing effect
        setTimeout(() => {
            setPushedCount(p => p + 1);
            onReward(0.02);
        }, 2000);
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-between p-4">
            <div className="text-center mb-4">
                <h2 className="text-3xl font-black text-white italic tracking-tighter drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">COIN PUSHER</h2>
                <p className="text-[#FFD700] font-bold text-sm uppercase tracking-widest">Pushed: {pushedCount}</p>
            </div>

            <div className="relative w-full max-w-md aspect-[4/5] bg-black/40 backdrop-blur-md rounded-[2rem] border-4 border-[#FFD700]/30 overflow-hidden shadow-[0_0_30px_rgba(255,215,0,0.1)]">
                {/* Pusher Bar */}
                <motion.div
                    animate={{ top: ["20%", "40%", "20%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute left-0 w-full h-8 bg-gradient-to-b from-[#FFD700]/40 to-transparent border-t border-[#FFD700]/50 z-10"
                />

                {/* Coin Table */}
                <div className="absolute inset-0 pt-[20%]">
                    <AnimatePresence>
                        {coins.map(coin => (
                            <motion.div
                                key={coin.id}
                                initial={{ top: "0%", left: `${coin.x}%`, scale: 0.5 }}
                                animate={{
                                    top: ["10%", "85%", "110%"],
                                    scale: [0.8, 1, 1.2],
                                    rotate: [0, 180, 360]
                                }}
                                transition={{ duration: 2.5, ease: "easeOut" }}
                                onAnimationComplete={() => {
                                    setCoins(prev => prev.filter(c => c.id !== coin.id));
                                }}
                                className="absolute w-10 h-10 rounded-full border-2 border-white/50 shadow-xl flex items-center justify-center font-bold text-white text-xs"
                                style={{ backgroundColor: coin.color, boxShadow: `0 0 15px ${coin.color}` }}
                            >
                                $
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Machine Floor */}
                <div className="absolute bottom-0 w-full h-1/4 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            <button
                onClick={dropCoin}
                className="mt-8 bg-[#FFD700] text-black px-12 py-5 rounded-full font-black text-xl shadow-[0_0_20px_rgba(255,215,0,0.5)] active:scale-95 transition-transform uppercase tracking-tighter italic"
            >
                Insert Coin
            </button>
        </div>
    );
}
