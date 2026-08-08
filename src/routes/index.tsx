import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ChevronLeft, RotateCcw, Lightbulb,
    Trophy, FastForward, Heart,
    Mail, Lock, Eye, EyeOff, User as UserIcon, LogOut, Loader2,
    DollarSign, Gift, History
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { initAds, showRewardedAd, showInterstitial, setBannerVisible } from '@/lib/ads'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type PathNode = {
    id: string;
    x: number;
    y: number;
    dir: Direction;
    color: string;
    cleared: boolean;
    isError?: boolean;
};

const COLORS = ['#22d3ee', '#f472b6', '#4ade80', '#fbbf24', '#818cf8'];

const REWARDS = [
    { id: 'v5', name: '$5 Visa Card', cost: 5.00 },
    { id: 'a5', name: '$5 Amazon Gift', cost: 5.00 },
    { id: 'p5', name: '$5 PayPal Cash', cost: 5.00 },
    { id: 'v10', name: '$10 Visa Card', cost: 10.00 },
];

export default function NeonPathGame() {
    const { user, profile, loading, signIn, signUp, signOut, addCash, supabase } = useAuth()
    const [activeTab, setActiveTab] = useState<'play' | 'shop' | 'payout'>('play')

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [showPass, setShowPass] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [level, setLevel] = useState(1);
    const [lives, setLives] = useState(3);
    const [nodes, setNodes] = useState<PathNode[]>([]);
    const [isWon, setIsWon] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const generateLevel = useCallback((lvl: number) => {
        const newNodes: PathNode[] = [];
        const count = Math.min(5 + Math.floor(lvl / 1.5), 18);
        const usedPositions = new Set();

        for(let i=0; i < count; i++) {
            let rx, ry;
            let attempts = 0;
            do {
                rx = Math.floor(Math.random() * 6);
                ry = Math.floor(Math.random() * 8);
                attempts++;
            } while(usedPositions.has(`${rx},${ry}`) && attempts < 100);

            usedPositions.add(`${rx},${ry}`);

            newNodes.push({
                id: `node-${i}-${Math.random()}`,
                x: rx,
                y: ry,
                dir: (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])[Math.floor(Math.random() * 4)],
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                cleared: false
            });
        }
        setNodes(newNodes);
        setIsWon(false);
        setLives(3);
    }, []);

    useEffect(() => {
        if (user && !loading) {
            generateLevel(level);
        }
    }, [level, user, loading]);

    const handleNodeClick = async (clickedNode: PathNode) => {
        if (isWon || clickedNode.cleared || isProcessing) return;

        const isBlocked = nodes.some(otherNode => {
            if (otherNode.cleared || otherNode.id === clickedNode.id) return false;
            if (clickedNode.dir === 'UP') return otherNode.x === clickedNode.x && otherNode.y < clickedNode.y;
            if (clickedNode.dir === 'DOWN') return otherNode.x === clickedNode.x && otherNode.y > clickedNode.y;
            if (clickedNode.dir === 'LEFT') return otherNode.y === clickedNode.y && otherNode.x < clickedNode.x;
            if (clickedNode.dir === 'RIGHT') return otherNode.y === clickedNode.y && otherNode.x > clickedNode.x;
            return false;
        });

        if (isBlocked) {
            if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Heavy });
            setNodes(prev => prev.map(n => n.id === clickedNode.id ? { ...n, isError: true } : n));
            setTimeout(() => setNodes(prev => prev.map(n => ({ ...n, isError: false }))), 400);

            if (lives > 1) {
                setLives(prev => prev - 1);
                toast.error("Blocked!");
            } else {
                toast.error("Out of lives! Level Reset.");
                generateLevel(level);
            }
            return;
        }

        if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Light });
        const updatedNodes = nodes.map(n => n.id === clickedNode.id ? { ...n, cleared: true } : n);
        setNodes(updatedNodes);

        const remaining = updatedNodes.filter(n => !n.cleared).length;
        if (remaining === 0) {
            handleWin();
        }
    };

    const handleWin = async () => {
        setIsWon(true);
        const reward = 0.05;
        await addCash(reward, `Level ${level}`);
        toast.success(`Victory! +$${reward}`);
        if (level % 2 === 0) await showInterstitial();
    };

    const handleHint = async () => {
        setIsProcessing(true);
        const ad = await showRewardedAd();
        if (ad.success) {
            const playable = nodes.find(n => {
                if (n.cleared) return false;
                return !nodes.some(other => {
                    if (other.cleared || other.id === n.id) return false;
                    if (n.dir === 'UP') return other.x === n.x && other.y < n.y;
                    if (n.dir === 'DOWN') return other.x === n.x && other.y > n.y;
                    if (n.dir === 'LEFT') return other.y === n.y && other.x < n.x;
                    if (n.dir === 'RIGHT') return other.y === n.y && other.x > n.x;
                    return false;
                });
            });
            if (playable) handleNodeClick(playable);
        }
        setIsProcessing(false);
    };

    const handlePayoutRequest = async (reward: any) => {
        if ((profile?.cash_balance || 0) < reward.cost) return toast.error("Need more cash!");
        if (!confirm(`Redeem $${reward.cost} for a ${reward.name}?`)) return;
        try {
            const { error } = await supabase.from('payout_requests').insert({ user_id: user?.id, reward_name: reward.name, amount: reward.cost });
            if (error) throw error;
            await addCash(-reward.cost, 'Redemption');
            toast.success("Success! Check your email soon.");
        } catch (e: any) { toast.error(e.message); }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            if (isLogin) await signIn(email, password);
            else await signUp(email, password, usernameInput);
        } catch (error: any) { toast.error(error.message); } finally { setIsSubmitting(false); }
    };

    if (loading) return <div className="h-screen w-full bg-[#050510] flex items-center justify-center text-white"><Loader2 className="animate-spin text-cyan-400 h-10 w-10" /></div>;

    if (!user) {
        return (
            <div className="h-screen w-full bg-[#050510] flex flex-col items-center justify-center p-8 text-white text-center">
                <div className="w-24 h-24 bg-cyan-400 rounded-3xl flex items-center justify-center shadow-glow mb-6">
                    <svg viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                </div>
                <h1 className="text-5xl font-black italic mb-2 text-white uppercase">Neon Path</h1>
                <p className="text-white/40 uppercase tracking-[0.4em] text-[10px] mb-10">Premium Puzzle Action</p>
                <form onSubmit={handleAuth} className="w-full max-w-sm space-y-3">
                    {!isLogin && <input type="text" placeholder="Gamer Tag" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-bold" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />}
                    <input type="email" placeholder="Email" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-bold" value={email} onChange={e => setEmail(e.target.value)} required />
                    <div className="relative">
                        <input type={showPass ? "text" : "password"} placeholder="Password" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-bold" value={password} onChange={e => setPassword(e.target.value)} required />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-4 opacity-30">{showPass ? <EyeOff size={20}/> : <Eye size={20}/>}</button>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-cyan-400 text-black py-5 rounded-3xl font-black uppercase tracking-widest shadow-glow mt-4 flex items-center justify-center gap-2">{isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}{isLogin ? 'Login' : 'Join Fleet'}</button>
                    <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-white/20 font-black uppercase mt-6">{isLogin ? "Need an account? Join" : "Back to Login"}</button>
                </form>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#02020a] text-white flex flex-col items-center overflow-hidden relative">
            <div className="flex-1 w-full max-w-md flex flex-col items-center z-10 px-4 pt-10 pb-32">
                {activeTab === 'play' && (
                    <>
                        <div className="w-full flex justify-between items-start mb-8">
                            <div className="flex flex-col gap-2">
                                <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2">
                                    <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                                    <span className="font-black text-lg">{lives}</span>
                                </div>
                                <button onClick={() => signOut()} className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 text-red-500"><LogOut size={20}/></button>
                            </div>
                            <div className="text-right">
                                <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-3xl mb-2">
                                    <div className="text-[9px] uppercase font-black opacity-30">Balance</div>
                                    <div className="text-2xl font-black italic text-cyan-400">${(profile?.cash_balance || 0).toFixed(2)}</div>
                                </div>
                                <div className="text-xs font-black text-white/40 uppercase">Level {level}</div>
                            </div>
                        </div>

                        <div className="relative w-full aspect-[3/4] bg-black/40 rounded-[2.5rem] border border-white/5 p-4 flex items-center justify-center">
                             <div className="grid grid-cols-6 grid-rows-8 gap-2 w-full h-full relative">
                                {nodes.map((node) => (
                                    <motion.button
                                        key={node.id}
                                        whileTap={{ scale: 0.8 }}
                                        animate={node.isError ? { x: [-5, 5, -5, 5, 0] } : {}}
                                        onClick={() => handleNodeClick(node)}
                                        style={{ gridColumnStart: node.x + 1, gridRowStart: node.y + 1, color: node.color, filter: node.cleared ? 'none' : `drop-shadow(0 0 10px ${node.color}aa)` }}
                                        className={cn("flex items-center justify-center transition-opacity duration-500", node.cleared ? "opacity-0 pointer-events-none" : "opacity-100")}
                                    >
                                        <ArrowIcon direction={node.dir} className="h-10 w-10" />
                                    </motion.button>
                                ))}
                             </div>
                        </div>

                        <div className="flex gap-4 w-full px-4 mt-8">
                             <button onClick={handleHint} className="flex-1 py-5 bg-yellow-400 text-black rounded-3xl flex items-center justify-center gap-2 font-black uppercase text-sm shadow-glow"><Lightbulb size={20} fill="black" /> Hint</button>
                            <button onClick={() => generateLevel(level)} className="p-5 bg-white/5 border border-white/10 rounded-3xl text-white"><RotateCcw size={24} /></button>
                        </div>
                    </>
                )}

                {activeTab === 'shop' && (
                    <div className="w-full py-8 text-center">
                         <h2 className="text-4xl font-black italic uppercase mb-10">Power Ups</h2>
                         <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] flex justify-between items-center">
                            <div className="text-left"><span className="font-black text-xl uppercase block">Level Skip</span><span className="text-[10px] opacity-40 font-bold uppercase">Stuck? Skip it!</span></div>
                            <button className="bg-pink-500 text-white font-black px-8 py-4 rounded-2xl shadow-glow">$1.99</button>
                         </div>
                    </div>
                )}

                {activeTab === 'payout' && (
                    <div className="w-full py-8">
                        <h2 className="text-4xl font-black italic uppercase text-center mb-8 text-emerald-400">Rewards</h2>
                        <div className="bg-gradient-to-br from-emerald-600 to-green-900 p-8 rounded-[3rem] border border-white/10 shadow-2xl">
                             <div className="flex justify-between items-start mb-6">
                                <Gift size={40} />
                                <div className="text-right"><div className="text-[8px] uppercase font-black opacity-60">Balance</div><div className="text-2xl font-black italic">${(profile?.cash_balance || 0).toFixed(2)}</div></div>
                             </div>
                             <div className="space-y-2">
                                {REWARDS.map(r => (
                                    <button key={r.id} onClick={() => handlePayoutRequest(r)} className={cn("w-full bg-black/20 hover:bg-black/40 p-5 rounded-2xl flex justify-between items-center transition-all border border-white/5", (profile?.cash_balance || 0) < r.cost && "opacity-40")}>
                                        <span className="font-black uppercase text-xs">{r.name}</span>
                                        <span className="text-xs font-black">${r.cost.toFixed(2)}</span>
                                    </button>
                                ))}
                             </div>
                        </div>
                    </div>
                )}
            </div>

            <nav className="fixed bottom-0 left-0 right-0 h-24 bg-[#050510]/95 backdrop-blur-3xl border-t border-white/5 flex justify-around items-center px-6 pb-6 z-50">
                <NavButton icon={ShoppingBag} label="Shop" active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} />
                <NavButton icon={Play} label="Play" active={activeTab === 'play'} onClick={() => setActiveTab('play')} />
                <NavButton icon={Award} label="Prizes" active={activeTab === 'payout'} onClick={() => setActiveTab('payout')} />
            </nav>

            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-12 text-center">
                        <Trophy className="h-32 w-32 text-cyan-400 mb-6 drop-shadow-glow" />
                        <h2 className="text-6xl font-black italic mb-8 uppercase">Victory!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-8 bg-cyan-400 text-black rounded-full font-black text-2xl uppercase shadow-glow flex items-center justify-center gap-3">Next Level <FastForward fill="black" /></button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
    return (
      <button onClick={onClick} className={cn("flex flex-col items-center justify-center gap-1 w-20 py-2 transition-all", active ? "text-cyan-400 scale-110" : "text-white/20")}>
        <Icon className={cn("h-6 w-6", active && "fill-current")} />
        <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
      </button>
    );
}

function ArrowIcon({ direction, className }: { direction: Direction, className?: string }) {
    const rotations = { UP: 'rotate-0', DOWN: 'rotate-180', LEFT: '-rotate-90', RIGHT: 'rotate-90' };
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform duration-500", rotations[direction], className)}>
            <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
    );
}
