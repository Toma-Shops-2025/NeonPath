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
    points: Point[]; // Sequence of points from Dot to Arrow
    dir: Direction;  // Final exit direction
    cleared: boolean;
    isError?: boolean;
    exitProgress?: number; // 0 to 1 for animation
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

    const gridW = 9;
    const gridH = 11;

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const generateLevel = useCallback((lvl: number) => {
        const newNodes: PathNode[] = [];
        const occupied = new Set<string>();
        const count = Math.min(6 + Math.floor(lvl / 1.5), 14);

        // Generate puzzles using "Reverse Logic" to guarantee solvability
        // We start with a piece at the edge and snake it IN.
        // That means it is GUARANTEED to be able to slide OUT.

        for (let i = 0; i < count; i++) {
            let points: Point[] = [];
            let dir: Direction;
            let attempts = 0;

            while (attempts < 100) {
                // 1. Pick a random edge to "enter" from
                const edge = Math.floor(Math.random() * 4);
                let start: Point;
                let initialDir: Direction;

                if (edge === 0) { start = { x: Math.floor(Math.random() * (gridW-2))+1, y: 0 }; initialDir = 'DOWN'; dir = 'UP'; }
                else if (edge === 1) { start = { x: Math.floor(Math.random() * (gridW-2))+1, y: gridH - 1 }; initialDir = 'UP'; dir = 'DOWN'; }
                else if (edge === 2) { start = { x: 0, y: Math.floor(Math.random() * (gridH-2))+1 }; initialDir = 'RIGHT'; dir = 'LEFT'; }
                else { start = { x: gridW - 1, y: Math.floor(Math.random() * (gridH-2))+1 }; initialDir = 'LEFT'; dir = 'RIGHT'; }

                if (occupied.has(`${start.x},${start.y}`)) { attempts++; continue; }

                // 2. Snake inwards
                let cur = { ...start };
                const path: Point[] = [cur];
                let currentOccupied = new Set<string>();
                currentOccupied.add(`${cur.x},${cur.y}`);

                const length = Math.floor(Math.random() * 3) + 2;
                let valid = true;
                let moveDir = initialDir;

                for (let j = 0; j < length; j++) {
                    // Try to move in moveDir
                    const dist = Math.floor(Math.random() * 2) + 1;
                    let next = { ...cur };
                    if (moveDir === 'UP') next.y -= dist;
                    else if (moveDir === 'DOWN') next.y += dist;
                    else if (moveDir === 'LEFT') next.x -= dist;
                    else next.x += dist;

                    // Bounds check
                    if (next.x < 1 || next.x > gridW - 2 || next.y < 1 || next.y > gridH - 2) { valid = false; break; }

                    // Check if path segment intersects existing pieces
                    const stepX = next.x > cur.x ? 1 : (next.x < cur.x ? -1 : 0);
                    const stepY = next.y > cur.y ? 1 : (next.y < cur.y ? -1 : 0);
                    let tx = cur.x, ty = cur.y;
                    while (tx !== next.x || ty !== next.y) {
                        tx += stepX; ty += stepY;
                        if (occupied.has(`${tx},${ty}`)) { valid = false; break; }
                    }
                    if (!valid) break;

                    path.push({ ...next });
                    cur = { ...next };
                    // Mark as occupied
                    tx = path[path.length-2].x; ty = path[path.length-2].y;
                    while (tx !== next.x || ty !== next.y) {
                        tx += stepX; ty += stepY;
                        occupied.add(`${tx},${ty}`);
                    }

                    // Change direction for next segment
                    moveDir = (moveDir === 'UP' || moveDir === 'DOWN')
                        ? (Math.random() > 0.5 ? 'LEFT' : 'RIGHT')
                        : (Math.random() > 0.5 ? 'UP' : 'DOWN');
                }

                if (valid && path.length >= 2) {
                    // Reverse the path so it goes from Inner Dot to Outer Arrow
                    points = path.reverse();
                    break;
                }
                attempts++;
            }

            if (points.length >= 2) {
                newNodes.push({
                    id: `node-${i}-${Math.random()}`,
                    points,
                    dir,
                    cleared: false
                });
            }
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

        // Collision logic: Check if the shape can move out in 'dir'
        const isBlocked = nodes.some(other => {
            if (other.cleared || other.id === clickedNode.id) return false;

            // For every point in the clicked shape, check if moving it along its exit direction hits another piece
            return clickedNode.points.some(p => {
                return other.points.some(op => {
                    if (clickedNode.dir === 'UP') return p.x === op.x && p.y > op.y;
                    if (clickedNode.dir === 'DOWN') return p.x === op.x && p.y < op.y;
                    if (clickedNode.dir === 'LEFT') return p.y === op.y && p.x > op.x;
                    if (clickedNode.dir === 'RIGHT') return p.y === op.y && p.x < op.x;
                    return false;
                });
            });
        });

        if (isBlocked) {
            if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Heavy });
            setNodes(prev => prev.map(n => n.id === clickedNode.id ? { ...n, isError: true } : n));
            setTimeout(() => setNodes(prev => prev.map(n => ({ ...n, isError: false }))), 400);
            if (lives > 1) setLives(prev => prev - 1);
            else {
                toast.error("Out of lives!");
                generateLevel(level);
            }
            return;
        }

        // Play success haptic
        if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Light });

        // Start exit animation
        setIsProcessing(true);
        setNodes(prev => prev.map(n => n.id === clickedNode.id ? { ...n, exitProgress: 1 } : n));

        // Delay removing from state until animation finishes
        setTimeout(() => {
            setNodes(prev => {
                const updated = prev.map(n => n.id === clickedNode.id ? { ...n, cleared: true } : n);
                if (updated.every(n => n.cleared)) {
                    setIsWon(true);
                    addCash(0.05, `Level ${level}`);
                }
                return updated;
            });
            setIsProcessing(false);
        }, 400);
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
                    {!isLogin && <input type="text" placeholder="Gamer Tag" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none shadow-sm" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />}
                    <input type="email" placeholder="Email" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none shadow-sm" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type="password" placeholder="Password" className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none shadow-sm" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="submit" className="w-full bg-[#5D6BB2] text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl mt-4">
                        {isLogin ? 'Login' : 'Join Game'}
                    </button>
                    <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-slate-400 font-black uppercase mt-6 tracking-widest">{isLogin ? "Need an account? Join" : "Back to Login"}</button>
                </form>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#F0F1F0] flex flex-col items-center overflow-hidden font-sans">
            {/* Header */}
            <div className="w-full px-6 pt-10 flex justify-between items-start z-20">
                <button onClick={() => signOut()} className="p-3 bg-[#E4E6F0] rounded-full text-[#5D6BB2] shadow-sm active:scale-90 transition-transform"><ChevronLeft size={24} strokeWidth={3}/></button>
                <div className="flex flex-col items-center pt-2">
                    <span className="text-[#5D6BB2] font-black text-lg mb-1 tracking-tight">Level {level}</span>
                    <div className="flex gap-1.5">
                        {[...Array(3)].map((_, i) => <Heart key={i} size={22} className={cn(i < lives ? "text-[#FF5252] fill-[#FF5B5B]" : "text-slate-200 fill-slate-200")} />)}
                    </div>
                </div>
                <div className="bg-white pl-5 pr-2 py-2 rounded-full shadow-md flex items-center gap-3 border border-white">
                     <span className="font-black text-slate-600 text-sm">{(profile?.cash_balance || 0).toFixed(2)}</span>
                     <div className="w-8 h-8 bg-[#FFD700] rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-inner border-2 border-white/20">
                        <div className="w-4 h-4 border-2 border-white/40 rounded-full" />
                     </div>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 w-full flex items-center justify-center p-6 mb-4">
                <div className="w-full max-w-sm aspect-[4/5] bg-white rounded-[3rem] shadow-2xl border-[12px] border-white relative overflow-hidden">
                    {/* Grid Intersection Dots */}
                    <div className="absolute inset-0 grid grid-cols-9 grid-rows-11 p-4">
                        {[...Array(99)].map((_, i) => (
                            <div key={i} className="flex items-center justify-center relative">
                                <div className="w-1.5 h-1.5 bg-slate-100 rounded-full z-0" />
                                <div className="absolute w-[0.5px] h-full bg-slate-50/20" />
                                <div className="absolute h-[0.5px] w-full bg-slate-50/20" />
                            </div>
                        ))}
                    </div>

                    {/* Nodes Layer */}
                    <div className="absolute inset-0 p-4">
                         {nodes.map((node) => (
                            <div
                                key={node.id}
                                className={cn(
                                    "absolute transition-all duration-500",
                                    node.cleared ? "opacity-0 scale-0" : "opacity-100"
                                )}
                                style={{
                                    left: `${(node.points[0].x / (gridW - 1)) * 100}%`,
                                    top: `${(node.points[0].y / (gridH - 1)) * 100}%`,
                                    width: '1px', height: '1px',
                                    zIndex: 30,
                                    transform: node.exitProgress ? `translate(${node.dir === 'LEFT' ? -400 : node.dir === 'RIGHT' ? 400 : 0}px, ${node.dir === 'UP' ? -400 : node.dir === 'DOWN' ? 400 : 0}px)` : 'none'
                                }}
                            >
                                <motion.button
                                    onClick={() => handleNodeClick(node)}
                                    animate={node.isError ? { x: [-3, 3, -3, 3, 0] } : {}}
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
            <div className="w-full px-8 pb-10 flex justify-between items-center z-20">
                <CircularButton icon={<Hash size={28} strokeWidth={3}/>} />
                <CircularButton icon={<Target size={28} strokeWidth={3}/>} />
                <button onClick={() => showRewardedAd()} className="w-16 h-16 bg-[#E4E6F0] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-all relative">
                    <Lightbulb size={28} strokeWidth={3}/>
                    <span className="absolute -top-1.5 -right-1.5 bg-white text-[9px] px-2 py-0.5 rounded-lg border border-slate-200 font-black text-[#5D6BB2] shadow-sm">AD</span>
                </button>
                <CircularButton onClick={() => generateLevel(level)} icon={<RotateCcw size={28} strokeWidth={3}/>} />
            </div>

            {/* Victory Overlay */}
            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-[#5D6BB2]/90 flex flex-col items-center justify-center p-12 text-center text-white backdrop-blur-md">
                        <Trophy className="h-40 w-40 mb-8 drop-shadow-2xl" />
                        <h2 className="text-6xl font-black italic mb-10 tracking-tighter">EXCELLENT!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-7 bg-white text-[#5D6BB2] rounded-full font-black text-2xl shadow-2xl transition-transform active:scale-95 uppercase tracking-tight">NEXT LEVEL</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function CircularButton({ icon, onClick }: { icon: any, onClick?: () => void }) {
    return (
        <button onClick={onClick} className="w-16 h-16 bg-[#E4E6F0] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-all">
            {icon}
        </button>
    );
}

function ArrowPath({ node, gridW, gridH }: { node: PathNode, gridW: number, gridH: number }) {
    const rotations = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };

    const boardW = 340;
    const boardH = 420;
    const unitW = boardW / (gridW - 1);
    const unitH = boardH / (gridH - 1);

    let pathD = "M 0 0";
    node.points.forEach((p, i) => {
        if (i === 0) return;
        const dx = (p.x - node.points[0].x) * unitW;
        const dy = (p.y - node.points[0].y) * unitH;
        pathD += ` L ${dx} ${dy}`;
    });

    const lastPoint = node.points[node.points.length - 1];
    const arrowX = (lastPoint.x - node.points[0].x) * unitW;
    const arrowY = (lastPoint.y - node.points[0].y) * unitH;

    return (
        <svg className="overflow-visible pointer-events-none">
            {/* The Main Black Path */}
            <path
                d={pathD}
                fill="none"
                stroke="#111"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* The Start Dot (Hollow circle) */}
            <circle cx="0" cy="0" r="7" fill="white" stroke="#111" strokeWidth="4" />

            {/* The Arrow Head */}
            <g transform={`translate(${arrowX}, ${arrowY}) rotate(${rotations[node.dir]})`}>
                <path d="M -16 -4 L 0 18 L 16 -4 Z" fill="#111" />
            </g>
        </svg>
    );
}
