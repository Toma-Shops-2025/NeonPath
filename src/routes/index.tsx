import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ChevronLeft, RotateCcw, Lightbulb, Settings,
    Trophy, Play, Pause, FastForward, Heart, Coins,
    Sparkles, Home, ShoppingBag, Award, Zap, Mail,
    Lock, Eye, EyeOff, User as UserIcon, LogOut, Loader2,
    DollarSign, Gift, History
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { initAds, showRewardedAd, showInterstitial, setBannerVisible } from '@/lib/ads'
import { Capacitor } from '@capacitor/core'

// Game Types
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type PathNode = {
    id: string;
    x: number;
    y: number;
    dir: Direction;
    color: string;
    cleared: boolean;
};

const COLORS = ['#22d3ee', '#f472b6', '#4ade80', '#fbbf24', '#818cf8'];

const REWARDS = [
    { id: 'v5', name: '$5 Visa Card', cost: 5.00, type: 'Visa' },
    { id: 'a5', name: '$5 Amazon Gift', cost: 5.00, type: 'Amazon' },
    { id: 'p5', name: '$5 PayPal Cash', cost: 5.00, type: 'PayPal' },
    { id: 'v10', name: '$10 Visa Card', cost: 10.00, type: 'Visa' },
];

export default function NeonPathGame() {
    const { user, profile, loading, signIn, signUp, signOut, addCash, supabase } = useAuth()
    const [activeTab, setActiveTab] = useState<'play' | 'shop' | 'payout'>('play')

    // Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [showPass, setShowPass] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Game State
    const [level, setLevel] = useState(1);
    const [nodes, setNodes] = useState<PathNode[]>([]);
    const [isWon, setIsWon] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Initialization
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const generateLevel = useCallback((lvl: number) => {
        const newNodes: PathNode[] = [];
        const count = Math.min(5 + Math.floor(lvl / 2), 20);

        for(let i=0; i < count; i++) {
            newNodes.push({
                id: `node-${i}`,
                x: Math.floor(Math.random() * 8),
                y: Math.floor(Math.random() * 10),
                dir: (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])[Math.floor(Math.random() * 4)],
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                cleared: false
            });
        }
        setNodes(newNodes);
        setIsWon(false);
    }, []);

    useEffect(() => {
        if (user) generateLevel(level);
    }, [level, generateLevel, user]);

    const handleNodeClick = (nodeId: string) => {
        if (isWon) return;

        setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, cleared: true } : n
        ));

        const remaining = nodes.filter(n => !n.cleared).length;
        if (remaining <= 1) {
            handleWin();
        }
    };

    const handleWin = async () => {
        setIsWon(true);
        const reward = 0.05; // $0.05 per level

        toast.promise(addCash(reward, `Level ${level}`), {
            loading: 'Saving reward...',
            success: `Level ${level} Cleared! +$${reward}`,
            error: 'Failed to save cash'
        });

        if (level % 2 === 0) {
            await showInterstitial();
        }
    };

    const handleHint = async () => {
        setIsProcessing(true);
        const ad = await showRewardedAd();
        if (ad.success) {
            // Auto-clear 3 nodes
            setNodes(prev => {
                const uncleared = prev.filter(n => !n.cleared);
                const toClear = uncleared.sort(() => Math.random() - 0.5).slice(0, 3).map(n => n.id);
                return prev.map(n => toClear.includes(n.id) ? { ...n, cleared: true } : n);
            });
            toast.success("Hint: Path Revealed!");
        }
        setIsProcessing(false);
    };

    const handlePayoutRequest = async (reward: any) => {
        if ((profile?.cash_balance || 0) < reward.cost) {
            toast.error("Insufficient balance");
            return;
        }

        if (!confirm(`Redeem $${reward.cost} for a ${reward.name}?`)) return;

        try {
            const { error } = await supabase.from('payout_requests').insert({
                user_id: user?.id,
                reward_name: reward.name,
                amount: reward.cost,
                status: 'pending'
            });

            if (error) throw error;
            await addCash(-reward.cost, 'Redemption');
            toast.success("Redemption Submitted! We will email you within 24 hours.");
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            if (isLogin) await signIn(email, password);
            else await signUp(email, password, usernameInput);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="h-screen w-full bg-[#050510] flex items-center justify-center text-white"><Loader2 className="animate-spin text-cyan-400 h-12 w-12" /></div>;

    if (!user) {
        return (
            <div className="h-screen w-full bg-[#050510] flex flex-col items-center justify-center p-8 text-white relative">
                 <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                    <div className="absolute top-1/4 -left-20 w-64 h-64 bg-cyan-500 rounded-full blur-[120px] animate-pulse" />
                    <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-pink-500 rounded-full blur-[120px] animate-pulse delay-700" />
                </div>

                <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
                    <div className="w-32 h-32 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-[2rem] flex items-center justify-center shadow-[0_0_50px_rgba(34,211,238,0.3)] mb-8 animate-bounce">
                        <ArrowIcon direction="UP" className="text-white h-16 w-16" />
                    </div>

                    <h1 className="text-5xl font-black italic mb-2 text-cyan-400 tracking-tighter uppercase text-center leading-none">Neon Path</h1>
                    <p className="text-white/40 uppercase tracking-[0.4em] text-[9px] mb-12 font-bold">Earn Real Rewards</p>

                    <form onSubmit={handleAuth} className="w-full space-y-3">
                        {!isLogin && (
                            <div className="bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 py-4 backdrop-blur-xl">
                                <UserIcon className="h-5 w-5 text-white/40 mr-3" />
                                <input type="text" placeholder="Gamer Tag" className="bg-transparent outline-none w-full font-bold text-white placeholder:text-white/20" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />
                            </div>
                        )}
                        <div className="bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 py-4 backdrop-blur-xl">
                            <Mail className="h-5 w-5 text-white/40 mr-3" />
                            <input type="email" placeholder="Email Address" className="bg-transparent outline-none w-full font-bold text-white placeholder:text-white/20" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 py-4 backdrop-blur-xl">
                            <Lock className="h-5 w-5 text-white/40 mr-3" />
                            <input type={showPass ? "text" : "password"} placeholder="Secure Password" title="Password" className="bg-transparent outline-none w-full font-bold text-white placeholder:text-white/20" value={password} onChange={e => setPassword(e.target.value)} required />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">{showPass ? <EyeOff className="h-4 w-4 opacity-30" /> : <Eye className="h-4 w-4 opacity-30" />}</button>
                        </div>

                        <button type="submit" disabled={isSubmitting} className="w-full bg-cyan-400 text-black py-5 rounded-3xl font-black uppercase tracking-widest shadow-[0_0_30px_rgba(34,211,238,0.4)] mt-6 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
                            {isLogin ? 'Login Now' : 'Create Account'}
                        </button>

                        <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-white/20 font-black uppercase mt-8 tracking-widest hover:text-white/40 transition-colors">
                            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#02020a] text-white font-sans flex flex-col items-center overflow-hidden relative">
            {/* Background Accent */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <span className="text-[90vh] font-black italic opacity-[0.05] select-none">NEON</span>
            </div>

            <div className="flex-1 w-full max-w-md flex flex-col items-center z-10 overflow-y-auto px-4 pt-10 pb-32 no-scrollbar">
                {activeTab === 'play' && (
                    <>
                        <div className="w-full flex justify-between items-start mb-8 px-2">
                            <div className="flex flex-col gap-2">
                                <button onClick={() => setLevel(Math.max(1, level - 1))} className="p-3 bg-white/5 rounded-xl border border-white/10 active:scale-90 transition-transform">
                                    <ChevronLeft className="h-6 w-6 text-white/40" />
                                </button>
                                <button onClick={() => signOut()} className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 active:scale-90 text-red-500 transition-transform">
                                    <LogOut className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="flex flex-col items-end gap-3 text-right">
                                <div className="bg-white/5 border border-white/10 px-6 py-4 rounded-[32px] flex flex-col items-end backdrop-blur-2xl shadow-2xl relative overflow-hidden group border-b-cyan-500/50">
                                    <div className="text-[10px] uppercase font-black opacity-30 mb-1 tracking-[0.2em]">Available Balance</div>
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-5 w-5 text-cyan-400" />
                                        <span className="text-3xl font-black italic tracking-tighter text-white">{(profile?.cash_balance || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="bg-cyan-500/10 px-5 py-2 rounded-full text-xs font-black italic text-cyan-400 border border-cyan-500/30">LEVEL {level}</div>
                            </div>
                        </div>

                        {/* Grid Canvas */}
                        <div className="relative w-full aspect-[4/5] bg-black/40 rounded-[3rem] border border-white/5 p-4 flex items-center justify-center shadow-inner overflow-hidden">
                             <div className="grid grid-cols-8 grid-rows-10 gap-1 w-full h-full relative">
                                {nodes.map((node) => (
                                    <button
                                        key={node.id}
                                        onClick={() => handleNodeClick(node.id)}
                                        style={{
                                            gridColumnStart: node.x + 1,
                                            gridRowStart: node.y + 1,
                                            color: node.color,
                                            filter: node.cleared ? 'none' : `drop-shadow(0 0 12px ${node.color}cc)`
                                        }}
                                        className={cn(
                                            "flex items-center justify-center transition-all duration-500 active:scale-50",
                                            node.cleared ? "opacity-10 scale-50 -rotate-45" : "opacity-100 scale-100 rotate-0"
                                        )}
                                    >
                                        <ArrowIcon direction={node.dir} className="h-8 w-8" />
                                    </button>
                                ))}
                             </div>
                        </div>

                        <div className="flex gap-4 w-full px-4 mt-8">
                             <button
                                onClick={handleHint}
                                disabled={isProcessing}
                                className="flex-1 py-5 bg-yellow-400 text-black rounded-[2rem] flex items-center justify-center gap-2 font-black italic uppercase text-sm shadow-[0_10px_30px_rgba(250,204,21,0.3)] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lightbulb className="h-5 w-5 fill-current" />}
                                Hint
                            </button>
                            <button
                                onClick={() => generateLevel(level)}
                                className="p-5 bg-white/5 border-2 border-white/10 rounded-[2rem] text-white active:scale-90 transition-transform"
                            >
                                <RotateCcw className="h-6 w-6" />
                            </button>
                        </div>
                    </>
                )}

                {activeTab === 'shop' && (
                    <div className="w-full py-8 space-y-6">
                         <h2 className="text-5xl font-black italic uppercase tracking-tighter mb-8 text-pink-500 text-center">Power Ups</h2>
                         <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] flex justify-between items-center backdrop-blur-xl">
                            <div className="flex flex-col">
                                <span className="font-black text-2xl italic uppercase leading-none mb-1">Level Skip</span>
                                <span className="text-[10px] opacity-40 font-bold uppercase tracking-widest">Too hard? Skip it!</span>
                            </div>
                            <button className="bg-pink-500 text-white font-black px-8 py-4 rounded-3xl shadow-[0_10px_30px_rgba(244,114,182,0.3)]">$1.99</button>
                         </div>
                    </div>
                )}

                {activeTab === 'payout' && (
                    <div className="w-full py-8 text-left">
                        <h2 className="text-5xl font-black italic uppercase tracking-tighter mb-8 text-emerald-400 text-center">Rewards</h2>

                        <div className="bg-gradient-to-br from-emerald-600 to-green-800 p-8 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden group mb-8">
                             <div className="flex justify-between items-start relative z-10">
                                <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md">
                                    <Gift className="h-10 w-10 text-white" />
                                </div>
                                <div className="bg-black/20 px-4 py-2 rounded-2xl border border-white/10 text-right backdrop-blur-md">
                                    <div className="text-[8px] uppercase font-black opacity-60 text-white">Your Wallet</div>
                                    <div className="text-2xl font-black italic text-white">${(profile?.cash_balance || 0).toFixed(2)}</div>
                                </div>
                             </div>
                             <h3 className="text-3xl font-black uppercase italic leading-none mb-2 mt-6 relative z-10">Instant Gift Cards</h3>
                             <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest mb-6 relative z-10">Delivered directly to your email</p>

                             <div className="grid grid-cols-1 gap-2 relative z-10">
                                {REWARDS.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => handlePayoutRequest(r)}
                                        className={cn(
                                            "bg-white/10 hover:bg-white/20 p-5 rounded-[2rem] flex justify-between items-center transition-all group/btn border border-white/5",
                                            (profile?.cash_balance || 0) < r.cost && "opacity-40 cursor-not-allowed"
                                        )}
                                    >
                                        <span className="font-black italic uppercase text-sm group-hover/btn:translate-x-1 transition-transform">{r.name}</span>
                                        <div className="flex items-center gap-1 bg-black/20 px-3 py-1 rounded-full border border-white/10">
                                            <span className="text-[11px] font-black">${r.cost.toFixed(2)}</span>
                                        </div>
                                    </button>
                                ))}
                             </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] flex items-center justify-between opacity-60">
                             <div className="flex items-center gap-3">
                                <History className="h-5 w-5" />
                                <span className="font-black uppercase text-[10px] tracking-widest">Recent Activity</span>
                             </div>
                             <span className="text-[10px] font-bold">Updated just now</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Global Nav */}
            <nav className="fixed bottom-0 left-0 right-0 h-28 bg-[#050510]/95 backdrop-blur-3xl border-t border-white/5 flex justify-around items-center px-6 pb-8 z-50">
                <NavButton icon={ShoppingBag} label="Shop" active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} />
                <NavButton icon={Home} label="Action" active={activeTab === 'play'} onClick={() => setActiveTab('play')} />
                <NavButton icon={Award} label="Prizes" active={activeTab === 'payout'} onClick={() => setActiveTab('payout')} />
            </nav>

            {/* Win Overlay */}
            <AnimatePresence>
                {isWon && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-12 text-center"
                    >
                        <div className="relative mb-12">
                            <div className="absolute inset-0 bg-cyan-500 rounded-full blur-[60px] opacity-30 animate-pulse" />
                            <Trophy className="h-40 w-40 text-cyan-400 drop-shadow-[0_0_40px_rgba(34,211,238,0.5)] relative z-10" />
                        </div>

                        <h2 className="text-7xl font-black italic mb-2 tracking-tighter uppercase leading-none">Victory!</h2>
                        <p className="text-white/40 uppercase tracking-[0.5em] text-xs mb-12 font-black">Next Path Unlocked</p>

                        <button
                            onClick={() => setLevel(prev => prev + 1)}
                            className="w-full max-w-xs py-8 bg-cyan-400 text-black rounded-full font-black text-2xl uppercase tracking-[0.2em] shadow-[0_15px_40px_rgba(34,211,238,0.4)] flex items-center justify-center gap-3 active:scale-95 transition-transform"
                        >
                            Next Level
                            <FastForward className="h-8 w-8 fill-current" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
    return (
      <button onClick={onClick} className={cn("flex flex-col items-center justify-center gap-1.5 w-24 py-3 transition-all active:scale-90", active ? "text-cyan-400 scale-110" : "text-white/20")}>
        <div className={cn("p-1.5 rounded-xl transition-colors", active && "bg-cyan-500/10")}>
            <Icon className={cn("h-7 w-7", active && "fill-current")} />
        </div>
        <span className={cn("text-[9px] font-black uppercase tracking-[0.15em]", active ? "opacity-100" : "opacity-40")}>{label}</span>
      </button>
    );
}

function ArrowIcon({ direction, className }: { direction: Direction, className?: string }) {
    const rotations = {
        UP: 'rotate-0',
        DOWN: 'rotate-180',
        LEFT: '-rotate-90',
        RIGHT: 'rotate-90'
    };

    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("transition-transform duration-500", rotations[direction], className)}
        >
            <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
    );
}
