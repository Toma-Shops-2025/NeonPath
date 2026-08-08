import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    RotateCcw, Lightbulb,
    Trophy, FastForward, Heart,
    Eye, EyeOff, LogOut, Loader2,
    Gift, ShoppingBag, Play, Award, ChevronLeft
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
    startX: number;
    startY: number;
    points: {x: number, y: number}[];
    dir: Direction;
    cleared: boolean;
    isError?: boolean;
};

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
        const count = Math.min(8 + Math.floor(lvl / 1.2), 20);
        const gridWidth = 7;
        const gridHeight = 9;
        const occupied = new Set<string>();

        for(let i=0; i < count; i++) {
            let sx, sy, dir: Direction;
            let attempts = 0;

            do {
                sx = Math.floor(Math.random() * gridWidth);
                sy = Math.floor(Math.random() * gridHeight);
                dir = (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])[Math.floor(Math.random() * 4)];
                attempts++;
            } while (occupied.has(`${sx},${sy}`) && attempts < 100);

            if (attempts >= 100) continue;

            // Generate a zig-zag path
            const points = [{x: sx, y: sy}];
            let curX = sx;
            let curY = sy;
            occupied.add(`${sx},${sy}`);

            const pathLength = Math.floor(Math.random() * 3) + 2;
            for(let j=0; j<pathLength; j++) {
                const turnDir = Math.random() > 0.5;
                if (dir === 'UP' || dir === 'DOWN') {
                    const step = turnDir ? 1 : -1;
                    if (curX + step >= 0 && curX + step < gridWidth && !occupied.has(`${curX + step},${curY}`)) {
                        curX += step;
                    }
                } else {
                    const step = turnDir ? 1 : -1;
                    if (curY + step >= 0 && curY + step < gridHeight && !occupied.has(`${curX},${curY + step}`)) {
                        curY += step;
                    }
                }
                points.push({x: curX, y: curY});
                occupied.add(`${curX},${curY}`);
            }

            newNodes.push({
                id: `node-${i}-${Math.random()}`,
                startX: sx,
                startY: sy,
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

        // Simplified collision: Can it move in its final direction?
        const isBlocked = nodes.some(other => {
            if (other.cleared || other.id === clickedNode.id) return false;
            const endPoint = clickedNode.points[clickedNode.points.length - 1];
            if (clickedNode.dir === 'UP') return other.startX === endPoint.x && other.startY < endPoint.y;
            if (clickedNode.dir === 'DOWN') return other.startX === endPoint.x && other.startY > endPoint.y;
            if (clickedNode.dir === 'LEFT') return other.startY === endPoint.y && other.startX < endPoint.x;
            if (clickedNode.dir === 'RIGHT') return other.startY === endPoint.y && other.startX > endPoint.x;
            return false;
        });

        if (isBlocked) {
            if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Heavy });
            setNodes(prev => prev.map(n => n.id === clickedNode.id ? { ...n, isError: true } : n));
            setTimeout(() => setNodes(prev => prev.map(n => ({ ...n, isError: false }))), 400);
            if (lives > 1) setLives(prev => prev - 1);
            else generateLevel(level);
            return;
        }

        if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Light });
        const updatedNodes = nodes.map(n => n.id === clickedNode.id ? { ...n, cleared: true } : n);
        setNodes(updatedNodes);
        if (updatedNodes.every(n => n.cleared)) handleWin();
    };

    const handleWin = async () => {
        setIsWon(true);
        const reward = 0.05;
        await addCash(reward, `Level ${level}`);
        if (level % 2 === 0) await showInterstitial();
    };

    if (loading) return <div className="h-screen w-full bg-white flex items-center justify-center"><Loader2 className="animate-spin text-blue-600 h-10 w-10" /></div>;

    if (!user) {
        return (
            <div className="h-screen w-full bg-[#f8f9ff] flex flex-col items-center justify-center p-8 text-slate-800 text-center font-sans">
                <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-lg mb-6">
                    <Play className="text-white h-10 w-10 fill-current" />
                </div>
                <h1 className="text-4xl font-black text-slate-900 mb-2">NEON PATH</h1>
                <p className="text-slate-400 uppercase tracking-widest text-[10px] mb-10 font-bold">The Ultimate Path Puzzle</p>
                <form onSubmit={handleAuth} className="w-full max-w-sm space-y-3">
                    {!isLogin && <input type="text" placeholder="Gamer Tag" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold shadow-sm" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />}
                    <input type="email" placeholder="Email" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold shadow-sm" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type={showPass ? "text" : "password"} placeholder="Password" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold shadow-sm" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-blue-200 shadow-xl mt-4">
                        {isLogin ? 'Login' : 'Join Game'}
                    </button>
                    <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-slate-400 font-black uppercase mt-6">{isLogin ? "Need an account? Join" : "Back to Login"}</button>
                </form>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#f0f2f9] flex flex-col items-center overflow-hidden font-sans">
            {/* Header */}
            <div className="w-full px-6 pt-12 flex justify-between items-center z-20">
                <button className="p-3 bg-white rounded-full shadow-sm text-slate-400"><ChevronLeft size={20}/></button>
                <div className="flex flex-col items-center">
                    <span className="text-blue-600 font-black text-sm uppercase">Level {level}</span>
                    <div className="flex gap-1 mt-1">
                        {[...Array(3)].map((_, i) => <Heart key={i} size={14} className={cn(i < lives ? "text-red-500 fill-red-500" : "text-slate-200 fill-slate-200")} />)}
                    </div>
                </div>
                <div className="bg-white px-4 py-2 rounded-full shadow-sm flex items-center gap-2">
                     <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center text-[10px] font-black text-white">C</div>
                     <span className="font-black text-slate-700 text-sm">{(profile?.cash_balance || 0).toFixed(2)}</span>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 w-full flex items-center justify-center p-4">
                <div className="w-full max-w-sm aspect-[4/5] bg-white rounded-[3rem] shadow-xl border-8 border-white relative overflow-hidden flex items-center justify-center">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 grid grid-cols-7 grid-rows-9">
                        {[...Array(63)].map((_, i) => (
                            <div key={i} className="border-[0.5px] border-slate-100 flex items-center justify-center">
                                <div className="w-1 h-1 bg-slate-200 rounded-full opacity-50" />
                            </div>
                        ))}
                    </div>

                    {/* Nodes (Arrows with Paths) */}
                    <div className="relative w-full h-full grid grid-cols-7 grid-rows-9 p-2">
                        {nodes.map((node) => (
                            <div key={node.id} style={{ gridColumnStart: node.startX + 1, gridRowStart: node.startY + 1 }} className="relative">
                                {!node.cleared && (
                                    <motion.button
                                        onClick={() => handleNodeClick(node)}
                                        animate={node.isError ? { x: [-3, 3, -3, 3, 0] } : {}}
                                        className="w-full h-full flex items-center justify-center z-30"
                                    >
                                        <ArrowShape node={node} />
                                    </motion.button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="w-full px-10 pb-12 flex justify-between items-center z-20">
                <button className="p-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-xl">#</button>
                <button className="p-4 bg-blue-50 text-blue-600 rounded-full"><div className="w-6 h-6 border-2 border-blue-600 rounded-full flex items-center justify-center"><div className="w-2 h-2 bg-blue-600 rounded-full" /></div></button>
                <button onClick={() => showRewardedAd()} className="p-4 bg-blue-50 text-blue-600 rounded-2xl relative">
                    <Lightbulb size={24} />
                    <span className="absolute -top-1 -right-1 bg-white text-[8px] px-1 rounded-md border border-slate-100 font-bold">AD</span>
                </button>
                <button onClick={() => generateLevel(level)} className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><RotateCcw size={24} /></button>
            </div>

            {/* Victory Overlay */}
            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-blue-600/95 flex flex-col items-center justify-center p-12 text-center text-white">
                        <Trophy className="h-32 w-32 mb-6" />
                        <h2 className="text-5xl font-black italic mb-8">VICTORY!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-6 bg-white text-blue-600 rounded-full font-black text-xl shadow-2xl">NEXT LEVEL</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function ArrowShape({ node }: { node: PathNode }) {
    // Generate SVG path based on points
    const cellSize = 100 / 7;
    let d = `M 50 50`; // Start at center of start cell

    // This logic creates the "bent" lines from the screenshots
    node.points.forEach((p, i) => {
        if (i === 0) return;
        const prev = node.points[i-1];
        const dx = (p.x - prev.x) * 100;
        const dy = (p.y - prev.y) * 100;
        d += ` l ${dx} ${dy}`;
    });

    const rotations = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };

    return (
        <svg viewBox="0 0 100 100" className="absolute overflow-visible w-full h-full pointer-events-none">
            {/* The Trail */}
            <path d={d} fill="none" stroke="black" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            {/* The Start Dot */}
            <circle cx="50" cy="50" r="6" fill="white" stroke="black" strokeWidth="2" />
            {/* The Head Arrow */}
            <g transform={`translate(${50 + (node.points[node.points.length-1].x - node.startX)*100}, ${50 + (node.points[node.points.length-1].y - node.startY)*100}) rotate(${rotations[node.dir]})`}>
                <path d="M -15 -10 L 0 15 L 15 -10 Z" fill="black" />
            </g>
        </svg>
    );
}
