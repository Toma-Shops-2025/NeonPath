import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ChevronLeft, Loader2,
    Target, Trophy, Gamepad2, Coins, ArrowRightLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { initAds, showRewardedAd, setBannerVisible } from '@/lib/ads'
import { music } from '@/lib/audio'
import { Capacitor } from '@capacitor/core'

// Game Components
import NeonPlinko from '@/components/games/NeonPlinko'
import NeonPusher from '@/components/games/NeonPusher'

type GameMode = 'NONE' | 'PLINKO' | 'PUSHER' | 'PATH';

export default function NeonHub() {
    const { user, profile, loading, signIn, signUp, signOut, addCash } = useAuth()
    const [mode, setMode] = useState<GameMode>('NONE')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [usernameInput, setUsernameInput] = useState('')
    const [isLogin, setIsLogin] = useState(true)

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        music.start();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            if (isLogin) await signIn(email, password);
            else await signUp(email, password, usernameInput);
        } catch (error: any) { toast.error(error.message); } finally { setIsSubmitting(false); }
    };

    if (loading) return <div className="h-screen w-full bg-black flex items-center justify-center"><Loader2 className="animate-spin text-[#00FFFF] h-10 w-10" /></div>;

    if (!user) {
        return (
            <div className="h-screen w-full bg-[#050505] flex flex-col items-center justify-center p-8 text-white text-center font-sans relative overflow-hidden">
                <div className="absolute inset-0 z-0 opacity-40">
                    <img src="/background.png" className="w-full h-full object-cover" alt="" />
                </div>
                <div className="relative z-10 w-full max-w-sm">
                    <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-6 mx-auto overflow-hidden border border-white/20">
                        <img src="/logo.png" className="w-full h-full object-cover" alt="Logo" />
                    </div>
                    <h1 className="text-4xl font-black text-[#00FFFF] mb-2 uppercase tracking-tighter italic drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">NEON HUB</h1>
                    <form onSubmit={handleAuth} className="space-y-3 mt-8">
                        {!isLogin && <input type="text" placeholder="Gamer Tag" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-bold outline-none focus:border-[#00FFFF] transition-all" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />}
                        <input type="email" placeholder="Email" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-bold outline-none focus:border-[#00FFFF] transition-all" value={email} onChange={e => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Password" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-bold outline-none focus:border-[#00FFFF] transition-all" value={password} onChange={e => setPassword(e.target.value)} required />
                        <button type="submit" className="w-full bg-[#00FFFF] text-black py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl mt-4 active:scale-95 transition-transform">
                            {isLogin ? 'Login' : 'Join Game'}
                        </button>
                        <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-white/50 font-black uppercase mt-6 tracking-widest">{isLogin ? "Need an account? Join" : "Back to Login"}</button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#050505] flex flex-col items-center overflow-hidden font-sans relative text-white">
            {/* Pulsating Background */}
            <motion.div
                className="absolute inset-0 z-0"
                animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
                <img src="/background.png" className="w-full h-full object-cover pointer-events-none" alt="" />
            </motion.div>

            {/* Hub Header */}
            <div className="w-full px-6 pt-12 flex justify-between items-center z-20 relative">
                <button onClick={() => mode === 'NONE' ? signOut() : setMode('NONE')} className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-[#00FFFF] border border-white/10 active:scale-90 transition-transform">
                    <ChevronLeft size={28} strokeWidth={3}/>
                </button>
                <div className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 flex items-center gap-3">
                    <div className="w-6 h-6 bg-[#FFD700] rounded-full shadow-[0_0_10px_#FFD700]" />
                    <span className="font-black text-xl tracking-tighter">{(profile?.cash_balance || 0).toFixed(2)}</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full relative z-10 overflow-y-auto pt-8">
                <AnimatePresence mode="wait">
                    {mode === 'NONE' ? (
                        <motion.div
                            key="menu"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="px-6 flex flex-col gap-4 items-center"
                        >
                            <h2 className="text-2xl font-black italic tracking-tighter mb-4 text-[#00FFFF] uppercase">Select Your Game</h2>

                            <GameCard
                                title="Neon Plinko"
                                icon={<Gamepad2 size={40} />}
                                color="#00FFFF"
                                onClick={() => { music.start(); setMode('PLINKO'); }}
                            />

                            <GameCard
                                title="Coin Pusher"
                                icon={<Coins size={40} />}
                                color="#FFD700"
                                onClick={() => { music.start(); setMode('PUSHER'); }}
                            />

                            <button
                                onClick={() => showRewardedAd()}
                                className="w-full max-w-sm mt-8 py-5 border-2 border-dashed border-white/20 rounded-3xl flex flex-col items-center justify-center hover:bg-white/5 transition-colors"
                            >
                                <Target className="text-[#FF00FF] mb-2" />
                                <span className="text-xs font-black uppercase tracking-widest text-white/60">Watch Ad for Reward</span>
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="game"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="h-full w-full flex flex-col items-center justify-center"
                        >
                            {mode === 'PLINKO' && <NeonPlinko onReward={(amt) => addCash(amt, 'Plinko')} />}
                            {mode === 'PUSHER' && <NeonPusher onReward={(amt) => addCash(amt, 'Pusher')} />}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

function GameCard({ title, icon, color, onClick }: { title: string, icon: any, color: string, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full max-w-sm aspect-video bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] relative overflow-hidden group active:scale-95 transition-transform"
        >
            <div className="absolute inset-0 bg-gradient-to-br opacity-10" style={{ backgroundColor: color }} />
            <div className="h-full flex flex-col items-center justify-center relative z-10">
                <div className="mb-4" style={{ color }}>{icon}</div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter">{title}</h3>
            </div>
        </button>
    );
}
