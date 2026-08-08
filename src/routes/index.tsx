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

        for (let i = 0; i < count; i++) {
            let points: Point[] = [];
            let dir: Direction;
            let attempts = 0;

            while (attempts < 100) {
                const edge = Math.floor(Math.random() * 4);
                let start: Point;
                let initialDir: Direction;

                if (edge === 0) { start = { x: Math.floor(Math.random() * (gridW-2))+1, y: 0 }; initialDir = 'DOWN'; dir = 'UP'; }
                else if (edge === 1) { start = { x: Math.floor(Math.random() * (gridW-2))+1, y: gridH - 1 }; initialDir = 'UP'; dir = 'DOWN'; }
                else if (edge === 2) { start = { x: 0, y: Math.floor(Math.random() * (gridH-2))+1 }; initialDir = 'RIGHT'; dir = 'LEFT'; }
                else { start = { x: gridW - 1, y: Math.floor(Math.random() * (gridH-2))+1 }; initialDir = 'LEFT'; dir = 'RIGHT'; }

                if (occupied.has(`${start.x},${start.y}`)) { attempts++; continue; }

                let cur = { ...start };
                const path: Point[] = [cur];
                let currentPathOccupied = new Set<string>();
                currentPathOccupied.add(`${cur.x},${cur.y}`);

                const length = Math.floor(Math.random() * 3) + 2;
                let valid = true;
                let moveDir = initialDir;

                for (let j = 0; j < length; j++) {
                    const dist = Math.floor(Math.random() * 2) + 1;
                    let next = { ...cur };
                    if (moveDir === 'UP') next.y -= dist;
                    else if (moveDir === 'DOWN') next.y += dist;
                    else if (moveDir === 'LEFT') next.x -= dist;
                    else next.x += dist;

                    if (next.x < 1 || next.x > gridW - 2 || next.y < 1 || next.y > gridH - 2) { valid = false; break; }

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

                    tx = path[path.length-2].x; ty = path[path.length-2].y;
                    while (tx !== next.x || ty !== next.y) {
                        tx += stepX; ty += stepY;
                        occupied.add(`${tx},${ty}`);
                    }

                    moveDir = (moveDir === 'UP' || moveDir === 'DOWN')
                        ? (Math.random() > 0.5 ? 'LEFT' : 'RIGHT')
                        : (Math.random() > 0.5 ? 'UP' : 'DOWN');
                }

                if (valid && path.length >= 2) {
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

        const isBlocked = nodes.some(other => {
            if (other.cleared || other.id === clickedNode.id) return false;
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
        <div className="h-screen w-full bg-[#F3F4F3] flex flex-col items-center overflow-hidden font-sans">
            {/* Header */}
            <div className="w-full px-6 pt-10 flex justify-between items-center z-20">
                <button onClick={() => signOut()} className="w-10 h-10 bg-[#E0E2EE] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm"><ChevronLeft size={22} strokeWidth={3}/></button>
                <div className="flex flex-col items-center">
                    <span className="text-[#5D6BB2] font-black text-sm uppercase mb-1">Level {level}</span>
                    <div className="flex gap-1">
                        {[...Array(3)].map((_, i) => <Heart key={i} size={16} className={cn(i < lives ? "text-[#FF4040] fill-[#FF4040]" : "text-slate-200 fill-slate-200")} />)}
                    </div>
                </div>
                <div className="bg-white pl-4 pr-1.5 py-1 rounded-full shadow-sm flex items-center gap-2 border border-slate-50">
                     <span className="font-black text-slate-600 text-xs">{(profile?.cash_balance || 0).toFixed(2)}</span>
                     <div className="w-7 h-7 bg-[#FFB800] rounded-full flex items-center justify-center border-2 border-white/30 shadow-inner">
                        <div className="w-3 h-3 border-2 border-white/40 rounded-full" />
                     </div>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 w-full flex items-center justify-center p-4">
                <div className="w-full max-w-sm aspect-[4/5.2] bg-white rounded-[2.5rem] shadow-2xl border-[10px] border-white relative overflow-hidden">
                    {/* Grid Dots */}
                    <div className="absolute inset-0 grid grid-cols-9 grid-rows-11 p-4">
                        {[...Array(99)].map((_, i) => (
                            <div key={i} className="flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-slate-100 rounded-full" />
                            </div>
                        ))}
                    </div>

                    {/* Nodes SVG Layer */}
                    <div className="absolute inset-0 p-4">
                        <svg viewBox="0 0 800 1000" className="w-full h-full overflow-visible">
                            {nodes.map((node) => (
                                <g
                                    key={node.id}
                                    onClick={() => handleNodeClick(node)}
                                    className="cursor-pointer"
                                    style={{
                                        opacity: node.cleared ? 0 : 1,
                                        transition: 'opacity 200ms, transform 500ms cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: node.exitProgress ? `translate(${node.dir === 'LEFT' ? -1000 : node.dir === 'RIGHT' ? 1000 : 0}px, ${node.dir === 'UP' ? -1000 : node.dir === 'DOWN' ? 1000 : 0}px)` : 'none'
                                    }}
                                >
                                    <motion.g animate={node.isError ? { x: [-10, 10, -10, 10, 0] } : {}}>
                                        <ArrowPathSVG node={node} />
                                    </motion.g>
                                </g>
                            ))}
                        </svg>
                    </div>
                </div>
            </div>

            {/* Bottom Controls */}
            <div className="w-full max-w-xs pb-12 flex justify-between items-center z-20">
                <CircularButton icon={<Hash size={24} strokeWidth={3}/>} />
                <CircularButton icon={<Target size={24} strokeWidth={3}/>} />
                <button onClick={() => showRewardedAd()} className="w-14 h-14 bg-[#E0E2EE] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm relative">
                    <Lightbulb size={24} strokeWidth={3}/>
                    <span className="absolute -top-1 -right-1 bg-white text-[8px] px-1.5 py-0.5 rounded-md border border-slate-100 font-black text-[#5D6BB2]">AD</span>
                </button>
                <CircularButton onClick={() => generateLevel(level)} icon={<RotateCcw size={24} strokeWidth={3}/>} />
            </div>

            {/* Victory Overlay */}
            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-[#5D6BB2]/90 flex flex-col items-center justify-center p-12 text-center text-white backdrop-blur-md">
                        <Trophy className="h-32 w-32 mb-6" />
                        <h2 className="text-5xl font-black italic mb-8">VICTORY!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-6 bg-white text-[#5D6BB2] rounded-full font-black text-xl shadow-2xl">NEXT LEVEL</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function CircularButton({ icon, onClick }: { icon: any, onClick?: () => void }) {
    return (
        <button onClick={onClick} className="w-14 h-14 bg-[#E0E2EE] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-all">
            {icon}
        </button>
    );
}

function ArrowPathSVG({ node }: { node: PathNode }) {
    const rotations = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };

    // SVG viewBox is 800x1000. Grid is 9x11 (8 spaces wide, 10 spaces high)
    // 800 / 8 = 100 per unit. 1000 / 10 = 100 per unit.
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
            {/* Trail */}
            <path d={pathD} fill="none" stroke="#222" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            {/* Start Dot */}
            <circle cx={getX(node.points[0].x)} cy={getY(node.points[0].y)} r="8" fill="white" stroke="#222" strokeWidth="4" />
            {/* Arrow Head - Sharp Triangle */}
            <g transform={`translate(${headX}, ${headY}) rotate(${rotations[node.dir]})`}>
                <path d="M -16 -6 L 0 16 L 16 -6 Z" fill="#222" />
            </g>
        </g>
    );
}
