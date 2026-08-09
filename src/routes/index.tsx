import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    RotateCcw, Lightbulb,
    Trophy, FastForward, Heart,
    ChevronLeft, Loader2,
    Target, Hash, Search
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { initAds, showRewardedAd, showInterstitial, setBannerVisible } from '@/lib/ads'
import { music } from '@/lib/audio'
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
    color: string;
    isError?: boolean;
    exitProgress?: number;
}

const NEON_COLORS = [
    '#FF00FF', // Pink
    '#00FF00', // Green
    '#FFFF00', // Yellow
    '#00FFFF', // Cyan
    '#FF0000', // Red
    '#9D00FF', // Purple
    '#FF8000', // Orange
];

export default function NeonPathGame() {
    const { user, profile, loading, signIn, signUp, signOut, addCash, supabase } = useAuth()

    const [level, setLevel] = useState(1);
    const [lives, setLives] = useState(3);
    const [nodes, setNodes] = useState<PathNode[]>([]);
    const [isWon, setIsWon] = useState(false);
    const [isGameOver, setIsGameOver] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasStarted, setHasStarted] = useState(false); // Music/Start gate

    // Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [usernameInput, setUsernameInput] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const gridW = 13;
    const gridH = 19;

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            initAds();
            setBannerVisible(true);
        }
    }, []);

    const generateLevel = useCallback((lvl: number) => {
        const newNodes: PathNode[] = [];
        const occupied = new Set<string>();
        // Increase target count for 13x19 grid (~250 dots)
        const targetCount = 350;
        let consecutiveFailures = 0;

        for (let i = 0; i < targetCount; i++) {
            let placed = false;
            let attempts = 0;
            while (attempts < 600) {
                const dir: Direction = (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])[Math.floor(Math.random() * 4)];
                const start: Point = {
                    x: Math.floor(Math.random() * gridW),
                    y: Math.floor(Math.random() * gridH)
                };

                if (occupied.has(`${start.x},${start.y}`)) { attempts++; continue; }

                // 1. Exit Path Check
                let canExit = true;
                let tx = start.x, ty = start.y;
                const stepX = dir === 'LEFT' ? -1 : (dir === 'RIGHT' ? 1 : 0);
                const stepY = dir === 'UP' ? -1 : (dir === 'DOWN' ? 1 : 0);

                tx += stepX; ty += stepY;
                while (tx >= 0 && tx < gridW && ty >= 0 && ty < gridH) {
                    if (occupied.has(`${tx},${ty}`)) { canExit = false; break; }
                    tx += stepX; ty += stepY;
                }
                if (!canExit) { attempts++; continue; }

                // 2. Snake Body - Compact 1-step logic
                let cur = { ...start };
                const path: Point[] = [cur];
                const segments = Math.floor(Math.random() * 4) + 2;
                let valid = true;
                const opposite: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
                let moveDir = opposite[dir];

                for (let j = 0; j < segments; j++) {
                    let next = { ...cur };
                    if (moveDir === 'UP') next.y -= 1;
                    else if (moveDir === 'DOWN') next.y += 1;
                    else if (moveDir === 'LEFT') next.x -= 1;
                    else next.x += 1;

                    if (next.x < 0 || next.x >= gridW || next.y < 0 || next.y >= gridH || occupied.has(`${next.x},${next.y}`)) {
                        valid = false; break;
                    }

                    path.push({ ...next });
                    cur = { ...next };
                    occupied.add(`${next.x},${next.y}`);

                    if (moveDir === 'UP' || moveDir === 'DOWN') moveDir = Math.random() > 0.5 ? 'LEFT' : 'RIGHT';
                    else moveDir = Math.random() > 0.5 ? 'UP' : 'DOWN';
                }

                if (valid && path.length >= 2) {
                    occupied.add(`${start.x},${start.y}`);
                    newNodes.push({
                        id: `node-${i}-${Math.random()}`,
                        points: path.reverse(),
                        dir,
                        cleared: false,
                        color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)]
                    });
                    placed = true;
                    break;
                }
                attempts++;
            }
            if (placed) consecutiveFailures = 0;
            else if (++consecutiveFailures > 120) break;
        }

        setNodes(newNodes);
        setIsWon(false);
        setIsGameOver(false);
        setLives(3);
    }, [gridW, gridH]);

    useEffect(() => {
        if (user && !loading) generateLevel(level);
    }, [level, user, loading, generateLevel]);

    const handleNodeClick = async (clickedNode: PathNode) => {
        music.start(); // Start music on first interaction
        if (isWon || isGameOver || clickedNode.cleared || isProcessing) return;

        // Enhanced Collision: Check if ANY part of our body would hit ANY part of another arrow on the way out
        const isBlocked = nodes.some(other => {
            if (other.cleared || other.id === clickedNode.id) return false;
            return clickedNode.points.some(p => {
                return other.points.some(op => {
                    // Body-Sweep logic: If any point of the other snake is directly in our path of travel
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
            // Visual Shake Error
            setNodes(prev => prev.map(n => n.id === clickedNode.id ? { ...n, isError: true } : n));
            setTimeout(() => setNodes(prev => prev.map(n => ({ ...n, isError: false }))), 400);

            // Strike logic
            const newLives = lives - 1;
            setLives(newLives);
            if (newLives <= 0) {
                setIsGameOver(true);
            }
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
        music.start(); // Start music on auth interaction
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
            <div className="h-screen w-full bg-[#F9F9F7] flex flex-col items-center justify-center p-8 text-slate-800 text-center font-sans relative overflow-hidden">
                {/* Background Image Placeholder */}
                <div className="absolute inset-0 z-0 opacity-20">
                    <img src="/background.png" className="w-full h-full object-cover" alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>

                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl mb-6 overflow-hidden border-2 border-[#5D6BB2]/20">
                        <img src="/logo.png" className="w-full h-full object-cover" alt="Neon Path" onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = '<div class="text-[#5D6BB2] font-black text-4xl italic">NP</div>';
                        }} />
                    </div>
                    <h1 className="text-4xl font-black text-[#5D6BB2] mb-2 uppercase tracking-tighter italic drop-shadow-sm">Neon Path</h1>
                    <form onSubmit={handleAuth} className="w-full max-w-sm space-y-3 mt-8">
                        {!isLogin && <input type="text" placeholder="Gamer Tag" className="w-full bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none shadow-sm focus:border-[#5D6BB2] transition-colors" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />}
                        <input type="email" placeholder="Email" className="w-full bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none shadow-sm focus:border-[#5D6BB2] transition-colors" value={email} onChange={e => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Password" className="w-full bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-4 font-bold outline-none shadow-sm focus:border-[#5D6BB2] transition-colors" value={password} onChange={e => setPassword(e.target.value)} required />
                        <button type="submit" className="w-full bg-[#5D6BB2] text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl mt-4 active:scale-95 transition-transform">
                            {isLogin ? 'Login' : 'Join Game'}
                        </button>
                        <button type="button" onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-[10px] text-slate-400 font-black uppercase mt-6 tracking-widest">{isLogin ? "Need an account? Join" : "Back to Login"}</button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen w-full bg-[#F5F6F5] flex flex-col items-center overflow-hidden font-sans relative">
            {/* Background Image - Pulsating */}
            <motion.div
                className="absolute inset-0 z-0"
                animate={{
                    scale: [1, 1.05, 1],
                    opacity: [0.5, 0.7, 0.5],
                    filter: ["blur(0px) brightness(1)", "blur(2px) brightness(1.2)", "blur(0px) brightness(1)"]
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            >
                <img src="/background.png" className="w-full h-full object-cover pointer-events-none" alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
            </motion.div>

            {/* Header */}
            <div className="w-full px-6 pt-12 flex justify-between items-start z-20 relative">
                <button onClick={() => signOut()} className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-transform border border-slate-100"><ChevronLeft size={28} strokeWidth={3}/></button>
                <div className="flex flex-col items-center mt-2">
                    <span className="text-[#5D6BB2]/60 font-black text-xs uppercase mb-1 tracking-widest">Level {level}</span>
                    <div className="flex gap-1.5">
                        {[...Array(lives)].map((_, i) => <Heart key={i} size={22} className="text-[#FF4A4A] fill-[#FF4A4A]" />)}
                        {[...Array(3 - lives)].map((_, i) => <Heart key={i} size={22} className="text-slate-200 fill-slate-200" />)}
                    </div>
                </div>
                <div className="bg-white pl-2 pr-6 py-2.5 rounded-full shadow-sm flex items-center gap-3 border border-slate-100">
                     <div className="w-8 h-8 bg-[#FFC107] rounded-full flex items-center justify-center border-2 border-white/20 shadow-inner">
                        <div className="w-4 h-4 border-2 border-white/40 rounded-full" />
                     </div>
                     <span className="font-black text-slate-700 text-lg">{(profile?.cash_balance || 0).toFixed(0)}</span>
                </div>
            </div>

            {/* Game Board */}
            <div className="flex-1 w-full flex items-center justify-center px-1 py-2 relative">
                <div className="w-full max-w-xl h-full max-h-[90vh] bg-white rounded-[2rem] shadow-xl border-[12px] border-white relative overflow-hidden">
                    {/* Full Grid Squares */}
                    <div className="absolute inset-0 p-3">
                        <div className="w-full h-full relative grid grid-cols-12 grid-rows-18 border-t border-l border-slate-200/50">
                            {[...Array(216)].map((_, i) => (
                                <div key={i} className="border-r border-b border-slate-200/50 flex items-start justify-start relative">
                                    <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-slate-200/80 rounded-full -translate-x-1/2 -translate-y-1/2" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Shapes SVG Layer */}
                    <div className="absolute inset-0 p-3">
                        <svg viewBox="0 0 1200 1800" className="w-full h-full overflow-visible">
                            {nodes.map((node) => (
                                <g
                                    key={node.id}
                                    onClick={() => handleNodeClick(node)}
                                    className="cursor-pointer pointer-events-auto"
                                    style={{
                                        opacity: node.cleared ? 0 : 1,
                                        transition: 'opacity 200ms'
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

                {/* START OVERLAY */}
                {!hasStarted && (
                    <div className="absolute inset-0 z-[60] flex items-center justify-center p-8">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-[3rem]" />
                        <motion.button
                            initial={{ scale: 0.9 }}
                            animate={{ scale: [0.9, 1.1, 0.9] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            onClick={() => { music.start(); setHasStarted(true); }}
                            className="relative z-10 bg-[#5D6BB2] text-white px-12 py-6 rounded-full font-black text-2xl shadow-2xl uppercase tracking-widest"
                        >
                            Tap to Play
                        </motion.button>
                    </div>
                )}
            </div>

            {/* Bottom Controls (Grouped Like Screenshot 2) */}
            <div className="w-full px-12 pb-14 flex justify-between items-center z-20">
                <CircularButton icon={<Hash size={28} strokeWidth={3}/>} />
                <CircularButton icon={<Target size={28} strokeWidth={3}/>} />
                <button onClick={() => showRewardedAd()} className="w-16 h-16 bg-[#E8EBF4] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm relative active:scale-90 transition-all">
                    <Lightbulb size={28} strokeWidth={3}/>
                    <span className="absolute -top-1.5 -right-1.5 bg-white text-[8px] px-2 py-0.5 rounded-lg border border-slate-200 font-black text-[#5D6BB2] shadow-sm">AD</span>
                </button>
                <CircularButton onClick={() => generateLevel(level)} icon={<RotateCcw size={28} strokeWidth={3}/>} />
            </div>

            {/* Overlays */}
            <AnimatePresence>
                {isWon && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-[#5D6BB2]/90 flex flex-col items-center justify-center p-12 text-center text-white backdrop-blur-md">
                        <Trophy className="h-40 w-40 mb-8 drop-shadow-2xl" />
                        <h2 className="text-6xl font-black italic mb-10 tracking-tighter">EXCELLENT!</h2>
                        <button onClick={() => setLevel(prev => prev + 1)} className="w-full max-w-xs py-7 bg-white text-[#5D6BB2] rounded-full font-black text-2xl shadow-2xl transition-transform active:scale-95 uppercase">NEXT LEVEL</button>
                    </motion.div>
                )}
                {isGameOver && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-12 text-center text-white backdrop-blur-md">
                        <Target className="h-40 w-40 mb-8 text-[#FF4A4A]" />
                        <h2 className="text-6xl font-black italic mb-10 tracking-tighter">GAME OVER</h2>
                        <p className="text-xl font-bold mb-10 text-slate-300">Too many strikes! The path is blocked.</p>
                        <button onClick={() => generateLevel(level)} className="w-full max-w-xs py-7 bg-[#FF4A4A] text-white rounded-full font-black text-2xl shadow-2xl transition-transform active:scale-95 uppercase">TRY AGAIN</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function CircularButton({ icon, onClick }: { icon: any, onClick?: () => void }) {
    return (
        <button onClick={onClick} className="w-16 h-16 bg-[#E8EBF4] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm active:scale-90 transition-all">
            {icon}
        </button>
    );
}

function ArrowShapeSVG({ node }: { node: PathNode }) {
    const getX = (x: number) => x * 100;
    const getY = (y: number) => y * 100;

    // 1. Calculate path
    const last = node.points[node.points.length - 1];
    const exitPoint = { x: last.x, y: last.y };
    const exitSteps = 20;
    if (node.dir === 'UP') exitPoint.y -= exitSteps;
    else if (node.dir === 'DOWN') exitPoint.y += exitSteps;
    else if (node.dir === 'LEFT') exitPoint.x -= exitSteps;
    else exitPoint.x += exitSteps;

    const fullPathPoints = [...node.points, exitPoint];
    let pathD = `M ${getX(fullPathPoints[0].x)} ${getY(fullPathPoints[0].y)}`;
    fullPathPoints.forEach((p, i) => { if (i > 0) pathD += ` L ${getX(p.x)} ${getY(p.y)}`; });

    let bodyLength = 0;
    for (let i = 0; i < node.points.length - 1; i++) {
        bodyLength += Math.sqrt(Math.pow(getX(node.points[i+1].x)-getX(node.points[i].x),2) + Math.pow(getY(node.points[i+1].y)-getY(node.points[i].y),2));
    }
    const exitLen = exitSteps * 100;
    const totalPathLength = bodyLength + exitLen;

    const motionPath = `path('${pathD}')`;

    return (
        <g>
            <motion.path
                d={pathD}
                fill="none"
                stroke={node.color}
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ strokeDasharray: `${bodyLength} ${totalPathLength}`, strokeDashoffset: 0 }}
                animate={node.exitProgress ? {
                    strokeDashoffset: -totalPathLength,
                    transition: { duration: 1.0, ease: "linear" }
                } : {}}
                style={{ filter: `drop-shadow(0 0 10px ${node.color})` }}
            />

            {/* Tail */}
            <motion.circle
                r="11"
                fill="white"
                stroke={node.color}
                strokeWidth="7"
                style={{ offsetPath: motionPath, offsetRotate: "0deg", filter: `drop-shadow(0 0 5px ${node.color})` }}
                initial={{ offsetDistance: "0%" }}
                animate={node.exitProgress ? {
                    offsetDistance: "100%",
                    transition: { duration: 1.0, ease: "linear" }
                } : {}}
            />

            {/* Head */}
            <motion.g
                style={{ offsetPath: motionPath, offsetRotate: "auto" }}
                initial={{ offsetDistance: `${(bodyLength / totalPathLength) * 100}%` }}
                animate={node.exitProgress ? {
                    offsetDistance: "100%",
                    transition: {
                        duration: 1.0 * (exitLen / totalPathLength),
                        delay: 1.0 * (bodyLength / totalPathLength),
                        ease: "linear"
                    }
                } : {}}
            >
                <path d="M -18 -26 L 18 -26 L 0 14 Z" fill={node.color} transform="rotate(180)" />
            </motion.g>
        </g>
    );
}
