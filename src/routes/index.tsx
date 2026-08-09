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
    exitProgress?: number;
}

export default function NeonPathGame() {
    const { user, profile, loading, signIn, signUp, signOut, addCash, supabase } = useAuth()

    const [level, setLevel] = useState(1);
    const [lives, setLives] = useState(3);
    const [nodes, setNodes] = useState<PathNode[]>([]);
    const [isWon, setIsWon] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const gridW = 8; // Number of columns
    const gridH = 10; // Number of rows

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const generateLevel = useCallback((lvl: number) => {
        const newNodes: PathNode[] = [];
        const occupied = new Set<string>();
        const count = Math.min(8 + Math.floor(lvl / 1.5), 18);

        for (let i = 0; i < count; i++) {
            let points: Point[] = [];
            let dir: Direction = 'UP';
            let attempts = 0;

            while (attempts < 50) {
                // Pick a start point
                const sx = Math.floor(Math.random() * (gridW - 2)) + 1;
                const sy = Math.floor(Math.random() * (gridH - 2)) + 1;
                if (occupied.has(`${sx},${sy}`)) { attempts++; continue; }

                const path: Point[] = [{x: sx, y: sy}];
                let curX = sx;
                let curY = sy;
                const segments = Math.floor(Math.random() * 2) + 1;
                let valid = true;

                for (let s = 0; s < segments; s++) {
                    const horiz = s % 2 === 0;
                    const len = Math.floor(Math.random() * 2) + 1;
                    const dx = horiz ? (Math.random() > 0.5 ? len : -len) : 0;
                    const dy = !horiz ? (Math.random() > 0.5 ? len : -len) : 0;

                    const nextX = Math.max(0, Math.min(gridW - 1, curX + dx));
                    const nextY = Math.max(0, Math.min(gridH - 1, curY + dy));

                    if (nextX === curX && nextY === curY) { valid = false; break; }

                    // Check path
                    const stepX = nextX > curX ? 1 : (nextX < curX ? -1 : 0);
                    const stepY = nextY > curY ? 1 : (nextY < curY ? -1 : 0);
                    let tx = curX, ty = curY;
                    while (tx !== nextX || ty !== nextY) {
                        tx += stepX; ty += stepY;
                        if (occupied.has(`${tx},${ty}`)) { valid = false; break; }
                    }
                    if (!valid) break;

                    path.push({x: nextX, y: nextY});
                    // Mark occupied
                    tx = curX; ty = curY;
                    while (tx !== nextX || ty !== nextY) {
                        tx += stepX; ty += stepY;
                        occupied.add(`${tx},${ty}`);
                    }
                    curX = nextX; curY = nextY;
                }

                if (valid && path.length >= 2) {
                    const last = path[path.length - 1];
                    const prev = path[path.length - 2];
                    if (last.x > prev.x) dir = 'RIGHT';
                    else if (last.x < prev.x) dir = 'LEFT';
                    else if (last.y > prev.y) dir = 'DOWN';
                    else dir = 'UP';
                    points = path;
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

        // Collision logic: Can the shape move out?
        const isBlocked = nodes.some(other => {
            if (other.cleared || other.id === clickedNode.id) return false;

            // Check if any point of clickedNode hits other's points when moving in clickedNode.dir
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
            else generateLevel(level);
            return;
        }

        if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Light });
        setIsProcessing(true);
        setNodes(prev => prev.map(n => n.id === clickedNode.id ? { ...n, exitProgress: 1 } : n));

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
        }, 500);
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
                    <Target className="text-white h-10 w-10" />
                </div>
                <h1 className="text-3xl font-black text-[#5D6BB2] mb-2 uppercase tracking-tighter italic">Neon Path</h1>
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
        <div className="h-screen w-full bg-[#F2F3F2] flex flex-col items-center overflow-hidden font-sans">
            {/* Header */}
            <div className="w-full px-6 pt-10 flex justify-between items-center z-20">
                <button onClick={() => signOut()} className="w-11 h-11 bg-[#E8EAF4] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm"><ChevronLeft size={24} strokeWidth={3}/></button>
                <div className="flex flex-col items-center">
                    <span className="text-[#5D6BB2] font-black text-sm uppercase mb-1">Level {level}</span>
                    <div className="flex gap-1">
                        {[...Array(3)].map((_, i) => <Heart key={i} size={20} className={cn(i < lives ? "text-[#FF4B4B] fill-[#FF4B4B]" : "text-slate-200 fill-slate-200")} />)}
                    </div>
                </div>
                <div className="bg-white pl-5 pr-2 py-1.5 rounded-full shadow-md flex items-center gap-3 border border-slate-50">
                     <span className="font-black text-slate-600 text-sm">{(profile?.cash_balance || 0).toFixed(2)}</span>
                     <div className="w-8 h-8 bg-[#FFD700] rounded-full flex items-center justify-center border-2 border-white/20 shadow-inner">
                        <div className="w-4 h-4 border-2 border-white/40 rounded-full" />
                     </div>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 w-full flex items-center justify-center p-6">
                <div className="w-full max-w-sm aspect-[4/5.4] bg-white rounded-[3rem] shadow-2xl border-[14px] border-white relative overflow-hidden">
                    {/* Grid Dots */}
                    <div className="absolute inset-0 grid grid-cols-8 grid-rows-10 p-4">
                        {[...Array(80)].map((_, i) => (
                            <div key={i} className="flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-slate-100 rounded-full" />
                            </div>
                        ))}
                    </div>

                    {/* Shapes Layer */}
                    <div className="absolute inset-0 p-4">
                        <svg viewBox="0 0 700 900" className="w-full h-full overflow-visible">
                            {nodes.map((node) => (
                                <g
                                    key={node.id}
                                    onClick={() => handleNodeClick(node)}
                                    className="cursor-pointer"
                                    style={{
                                        opacity: node.cleared ? 0 : 1,
                                        transition: 'opacity 200ms, transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: node.exitProgress ? `translate(${node.dir === 'LEFT' ? -1000 : node.dir === 'RIGHT' ? 1000 : 0}px, ${node.dir === 'UP' ? -1000 : node.dir === 'DOWN' ? 1000 : 0}px)` : 'none'
                                    }}
                                >
                                    <motion.g animate={node.isError ? { x: [-10, 10, -10, 10, 0] } : {}}>
                                        <ArrowShapeSVG node={node} />
                                    </motion.g>
                                </g>
                            ))}
                        </svg>
                    </div>
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="w-full px-12 pb-12 flex justify-between items-center z-20">
                <CircularButton icon={<Hash size={24} strokeWidth={3}/>} />
                <CircularButton icon={<Target size={24} strokeWidth={3}/>} />
                <button onClick={() => showRewardedAd()} className="w-14 h-14 bg-[#E8EAF4] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm relative">
                    <Lightbulb size={24} strokeWidth={3}/>
                    <span className="absolute -top-1.5 -right-1.5 bg-white text-[8px] px-1.5 py-0.5 rounded-lg border border-slate-200 font-black text-[#5D6BB2]">AD</span>
                </button>
                <CircularButton onClick={() => generateLevel(level)} icon={<RotateCcw size={24} strokeWidth={3}/>} />
            </div>

            {/* Victory Overlay */}
            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-[#5D6BB2]/90 flex flex-col items-center justify-center p-12 text-center text-white backdrop-blur-md">
                        <Trophy className="h-40 w-40 mb-8 drop-shadow-2xl" />
                        <h2 className="text-6xl font-black italic mb-10 tracking-tighter">EXCELLENT!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-7 bg-white text-[#5D6BB2] rounded-full font-black text-2xl shadow-2xl transition-transform active:scale-95 uppercase">NEXT LEVEL</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function CircularButton({ icon, onClick }: { icon: any, onClick?: () => void }) {
    return (
        <button onClick={onClick} className="w-14 h-14 bg-[#E8EAF4] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-all">
            {icon}
        </button>
    );
}

function ArrowShapeSVG({ node }: { node: PathNode }) {
    const rotations = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };
    const getX = (x: number) => x * 100;
    const getY = (y: number) => y * 100;

    let pathD = `M ${getX(node.points[0].x)} ${getY(node.points[0].y)}`;
    node.points.forEach((p, i) => {
        if (i === 0) return;
        pathD += ` L ${getX(p.x)} ${getY(p.y)}`;
    });

    const last = node.points[node.points.length - 1];
    const headX = getX(last.x);
    const headY = getY(last.y);

    return (
        <g>
            <path d={pathD} fill="none" stroke="#1a1a1a" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={getX(node.points[0].x)} cy={getY(node.points[0].y)} r="8" fill="white" stroke="#1a1a1a" strokeWidth="4" />
            <g transform={`translate(${headX}, ${headY}) rotate(${rotations[node.dir]})`}>
                <path d="M -18 -6 L 0 18 L 18 -6 Z" fill="#1a1a1a" />
            </g>
        </g>
    );
}
