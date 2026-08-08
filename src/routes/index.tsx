import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    RotateCcw, Lightbulb,
    Trophy, FastForward, Heart,
    ChevronLeft, Loader2,
    Target, Hash
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { initAds, showRewardedAd, showInterstitial, setBannerVisible } from '@/lib/ads'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Point {
    x: number;
    y: number;
}

interface PathNode {
    id: string;
    points: Point[];
    dir: Direction;
    cleared: boolean;
    isError?: boolean;
}

export default function NeonPathGame() {
    const { user, profile, loading, signIn, signUp, signOut, addCash, supabase } = useAuth()
    const [activeTab, setActiveTab] = useState<'play' | 'shop' | 'payout'>('play')

    // Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Game State
    const [level, setLevel] = useState(1);
    const [lives, setLives] = useState(3);
    const [nodes, setNodes] = useState<PathNode[]>([]);
    const [isWon, setIsWon] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const gridW = 9; // Number of vertical lines
    const gridH = 11; // Number of horizontal lines

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const generateLevel = useCallback((lvl: number) => {
        const newNodes: PathNode[] = [];
        const occupiedPoints = new Set<string>();
        const count = Math.min(6 + Math.floor(lvl / 1.5), 12);

        for (let i = 0; i < count; i++) {
            let sx = Math.floor(Math.random() * (gridW - 2)) + 1;
            let sy = Math.floor(Math.random() * (gridH - 2)) + 1;
            let attempts = 0;

            while (occupiedPoints.has(`${sx},${sy}`) && attempts < 50) {
                sx = Math.floor(Math.random() * (gridW - 2)) + 1;
                sy = Math.floor(Math.random() * (gridH - 2)) + 1;
                attempts++;
            }

            const points: Point[] = [{ x: sx, y: sy }];
            occupiedPoints.add(`${sx},${sy}`);

            let curX = sx;
            let curY = sy;
            const segments = Math.floor(Math.random() * 3) + 1;

            for (let s = 0; s < segments; s++) {
                const horizontal = s % 2 === 0;
                const dist = Math.floor(Math.random() * 2) + 1;
                let nextX = curX;
                let nextY = curY;

                if (horizontal) {
                    nextX = Math.max(0, Math.min(gridW - 1, curX + (Math.random() > 0.5 ? dist : -dist)));
                } else {
                    nextY = Math.max(0, Math.min(gridH - 1, curY + (Math.random() > 0.5 ? dist : -dist)));
                }

                if (nextX === curX && nextY === curY) continue;

                points.push({ x: nextX, y: nextY });
                curX = nextX;
                curY = nextY;
            }

            const last = points[points.length - 1];
            const prev = points[points.length - 2] || points[0];
            let dir: Direction = 'UP';
            if (last.x > prev.x) dir = 'RIGHT';
            else if (last.x < prev.x) dir = 'LEFT';
            else if (last.y > prev.y) dir = 'DOWN';
            else dir = 'UP';

            newNodes.push({
                id: `node-${i}-${Math.random()}`,
                points,
                dir,
                cleared: false
            });
        }

        setNodes(newNodes);
        setIsWon(false);
        setLives(3);
    }, []);

    useEffect(() => {
        if (user && !loading) generateLevel(level);
    }, [level, user, loading, generateLevel]);

    const handleNodeClick = async (clickedNode: PathNode) => {
        if (isWon || clickedNode.cleared || isProcessing) return;

        if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Light });

        const updatedNodes = nodes.map(n => n.id === clickedNode.id ? { ...n, cleared: true } : n);
        setNodes(updatedNodes);

        if (updatedNodes.every(n => n.cleared)) {
            handleWin();
        }
    };

    const handleWin = async () => {
        setIsWon(true);
        const reward = 0.05;
        await addCash(reward, `Level ${level}`);
        if (level % 2 === 0) await showInterstitial();
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

    if (loading) return <div className="h-screen w-full bg-white flex items-center justify-center"><Loader2 className="animate-spin text-[#5D6BB2] h-10 w-10" /></div>;

    if (!user) {
        return (
            <div className="h-screen w-full bg-[#F9F9F7] flex flex-col items-center justify-center p-8 text-slate-800 text-center font-sans">
                <div className="w-20 h-20 bg-[#5D6BB2] rounded-3xl flex items-center justify-center shadow-lg mb-6">
                    <Hash className="text-white h-10 w-10" />
                </div>
                <h1 className="text-3xl font-black text-[#5D6BB2] mb-2 uppercase tracking-tighter">Neon Path</h1>
                <form onSubmit={handleAuth} className="w-full max-w-sm space-y-3 mt-8">
                    {!isLogin && <input type="text" placeholder="Gamer Tag" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />}
                    <input type="email" placeholder="Email" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type="password" placeholder="Password" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="submit" className="w-full bg-[#5D6BB2] text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl mt-4">
                        {isLogin ? 'Login' : 'Join Game'}
                    </button>
                    <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-slate-400 font-black uppercase mt-6 tracking-widest">{isLogin ? "Need an account? Join" : "Back to Login"}</button>
                </form>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#F9F9F7] flex flex-col items-center overflow-hidden font-sans">
            {/* Header */}
            <div className="w-full px-6 pt-10 flex justify-between items-start z-20">
                <button onClick={() => signOut()} className="p-3 bg-[#E0E2EE] rounded-full text-[#5D6BB2] transition-transform active:scale-90 shadow-sm"><ChevronLeft size={24} strokeWidth={3}/></button>
                <div className="flex flex-col items-center pt-2">
                    <span className="text-[#5D6BB2] font-black text-base uppercase tracking-tight">Level {level}</span>
                    <div className="flex gap-1 mt-1">
                        {[...Array(3)].map((_, i) => <Heart key={i} size={18} className={cn(i < lives ? "text-red-500 fill-red-500" : "text-slate-200 fill-slate-200")} />)}
                    </div>
                </div>
                <div className="bg-white pl-5 pr-2 py-1.5 rounded-full shadow-sm flex items-center gap-3 border border-slate-100">
                     <span className="font-black text-slate-600 text-sm">{(profile?.cash_balance || 0).toFixed(2)}</span>
                     <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-inner border-2 border-white/20">
                        <div className="w-3.5 h-3.5 border-2 border-white/30 rounded-full" />
                     </div>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 w-full flex items-center justify-center p-6 mb-8">
                <div className="w-full max-w-sm aspect-[4/5] bg-white rounded-[2.5rem] shadow-xl border-4 border-white/50 relative overflow-hidden">
                    {/* Grid Intersection Dots */}
                    <div className="absolute inset-0 grid grid-cols-9 grid-rows-11 p-4">
                        {[...Array(99)].map((_, i) => (
                            <div key={i} className="flex items-center justify-center relative">
                                <div className="w-1.5 h-1.5 bg-slate-100 rounded-full z-0" />
                                <div className="absolute w-[0.5px] h-full bg-slate-50/30" />
                                <div className="absolute h-[0.5px] w-full bg-slate-50/30" />
                            </div>
                        ))}
                    </div>

                    {/* Nodes Area */}
                    <div className="absolute inset-0 p-4">
                         {nodes.map((node) => (
                            <div
                                key={node.id}
                                className={cn(
                                    "absolute transition-opacity duration-300",
                                    node.cleared ? "opacity-0 pointer-events-none" : "opacity-100"
                                )}
                                style={{
                                    left: `${(node.points[0].x / (gridW - 1)) * 100}%`,
                                    top: `${(node.points[0].y / (gridH - 1)) * 100}%`,
                                    width: '1px', height: '1px', // Anchor point
                                    zIndex: 30
                                }}
                            >
                                <motion.button
                                    onClick={() => handleNodeClick(node)}
                                    whileTap={{ scale: 0.95 }}
                                    className="relative origin-top-left"
                                    style={{ width: '40px', height: '40px', transform: 'translate(-20px, -20px)' }}
                                >
                                    <ArrowPath node={node} gridW={gridW} gridH={gridH} />
                                </motion.button>
                            </div>
                         ))}
                    </div>
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="w-full px-8 pb-12 flex justify-between items-center z-20">
                <CircularButton icon={<Hash size={24} strokeWidth={3}/>} />
                <CircularButton icon={<Target size={24} strokeWidth={3}/>} />
                <CircularButton
                    onClick={() => showRewardedAd()}
                    icon={<Lightbulb size={24} strokeWidth={3}/>}
                    badge="AD"
                />
                <CircularButton onClick={() => generateLevel(level)} icon={<RotateCcw size={24} strokeWidth={3}/>} />
            </div>

            {/* Victory Overlay */}
            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-[#5D6BB2]/95 flex flex-col items-center justify-center p-12 text-center text-white backdrop-blur-sm">
                        <Trophy className="h-32 w-32 mb-6 drop-shadow-2xl" />
                        <h2 className="text-5xl font-black italic mb-8 tracking-tighter">LEVEL COMPLETE!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-6 bg-white text-[#5D6BB2] rounded-full font-black text-xl shadow-2xl transition-transform active:scale-95">CONTINUE</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function CircularButton({ icon, onClick, badge }: { icon: any, onClick?: () => void, badge?: string }) {
    return (
        <button onClick={onClick} className="w-16 h-16 bg-[#E0E2EE] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-all relative">
            {icon}
            {badge && (
                <span className="absolute -top-1 -right-1 bg-white text-[8px] px-1.5 py-0.5 rounded-md border border-slate-200 font-black text-[#5D6BB2] shadow-sm">
                    {badge}
                </span>
            )}
        </button>
    );
}

function ArrowPath({ node, gridW, gridH }: { node: PathNode, gridW: number, gridH: number }) {
    const rotations = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };

    // Scale calculation based on parent container being roughly 300-400px wide
    // We want the SVG to draw the lines relative to the grid
    const cellW = (1 / (gridW - 1)) * 340; // Approx board width
    const cellH = (1 / (gridH - 1)) * 420; // Approx board height

    let pathD = "M 0 0";
    node.points.forEach((p, i) => {
        if (i === 0) return;
        const dx = (p.x - node.points[0].x) * cellW;
        const dy = (p.y - node.points[0].y) * cellH;
        pathD += ` L ${dx} ${dy}`;
    });

    const lastPoint = node.points[node.points.length - 1];
    const arrowX = (lastPoint.x - node.points[0].x) * cellW;
    const arrowY = (lastPoint.y - node.points[0].y) * cellH;

    return (
        <svg className="overflow-visible pointer-events-none">
            {/* The Trail */}
            <path
                d={pathD}
                fill="none"
                stroke="#1a1a1a"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* The Start Dot (Empty in middle) */}
            <circle cx="0" cy="0" r="6" fill="white" stroke="#1a1a1a" strokeWidth="2.5" />

            {/* The Arrow Head */}
            <g transform={`translate(${arrowX}, ${arrowY}) rotate(${rotations[node.dir]})`}>
                <path d="M -15 -6 L 0 16 L 15 -6 Z" fill="#1a1a1a" />
            </g>
        </svg>
    );
}
