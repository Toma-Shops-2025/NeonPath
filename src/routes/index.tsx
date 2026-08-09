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
    const [isGameOver, setIsGameOver] = useState(false);
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
        // Extreme density: Try to fill every possible gap for a traffic jam feel
        const targetCount = Math.min(80 + (lvl * 5), 140);
        let consecutiveFailures = 0;

        for (let i = 0; i < targetCount; i++) {
            let placed = false;
            let attempts = 0;
            while (attempts < 400) {
                const dir: Direction = (['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[])[Math.floor(Math.random() * 4)];
                const start: Point = {
                    x: Math.floor(Math.random() * gridW),
                    y: Math.floor(Math.random() * gridH)
                };

                if (occupied.has(`${start.x},${start.y}`)) { attempts++; continue; }

                // 1. Check if exit path is clear (Reverse Generation Rule)
                let canExit = true;
                let tx = start.x, ty = start.y;

                // Move one step in exit direction to start checking
                if (dir === 'UP') ty--;
                else if (dir === 'DOWN') ty++;
                else if (dir === 'LEFT') tx--;
                else tx++;

                while (tx >= 0 && tx < gridW && ty >= 0 && ty < gridH) {
                    if (occupied.has(`${tx},${ty}`)) { canExit = false; break; }
                    if (dir === 'UP') ty--;
                    else if (dir === 'DOWN') ty++;
                    else if (dir === 'LEFT') tx--;
                    else tx++;
                }
                if (!canExit) { attempts++; continue; }

                // 2. Snake BACKWARDS from the head to create the body
                let cur = { ...start };
                const path: Point[] = [cur];
                const segments = Math.floor(Math.random() * 2) + 2;
                let valid = true;

                const opposite: Record<Direction, Direction> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
                let moveDir = opposite[dir];

                for (let j = 0; j < segments; j++) {
                    const dist = Math.floor(Math.random() * 2) + 1;
                    let next = { ...cur };
                    if (moveDir === 'UP') next.y -= dist;
                    else if (moveDir === 'DOWN') next.y += dist;
                    else if (moveDir === 'LEFT') next.x -= dist;
                    else next.x += dist;

                    if (next.x < 0 || next.x >= gridW || next.y < 0 || next.y >= gridH) { valid = false; break; }

                    const stepX = next.x > cur.x ? 1 : (next.x < cur.x ? -1 : 0);
                    const stepY = next.y > cur.y ? 1 : (next.y < cur.y ? -1 : 0);
                    let sx = cur.x, sy = cur.y;

                    while (sx !== next.x || sy !== next.y) {
                        sx += stepX; sy += stepY;
                        if (occupied.has(`${sx},${sy}`)) { valid = false; break; }
                    }
                    if (!valid) break;

                    path.push({ ...next });
                    cur = { ...next };

                    sx = path[path.length-2].x; sy = path[path.length-2].y;
                    while (sx !== next.x || sy !== next.y) {
                        sx += stepX; sy += stepY;
                        occupied.add(`${sx},${sy}`);
                    }

                    if (moveDir === 'UP' || moveDir === 'DOWN') moveDir = Math.random() > 0.5 ? 'LEFT' : 'RIGHT';
                    else moveDir = Math.random() > 0.5 ? 'UP' : 'DOWN';
                }

                if (valid && path.length >= 2) {
                    occupied.add(`${start.x},${start.y}`);
                    newNodes.push({
                        id: `node-${i}-${Math.random()}`,
                        points: path.reverse(),
                        dir,
                        cleared: false
                    });
                    placed = true;
                    break;
                }
                attempts++;
            }

            if (placed) {
                consecutiveFailures = 0;
            } else {
                consecutiveFailures++;
                if (consecutiveFailures > 60) break;
            }
        }

        setNodes(newNodes);
        setIsWon(false);
        setIsGameOver(false);
        setLives(3);
    }, []);

    useEffect(() => {
        if (user && !loading) generateLevel(level);
    }, [level, user, loading, generateLevel]);

    const handleNodeClick = async (clickedNode: PathNode) => {
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
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
                <img src="/background.png" className="w-full h-full object-cover opacity-10 pointer-events-none" alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
            </div>

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
            <div className="flex-1 w-full flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md h-full max-h-[75vh] bg-white rounded-[3rem] shadow-xl border-[16px] border-white relative overflow-hidden">
                    {/* Full Grid Squares */}
                    <div className="absolute inset-0 p-4">
                        <div className="w-full h-full relative grid grid-cols-8 grid-rows-10 border-t border-l border-slate-200/50">
                            {[...Array(80)].map((_, i) => (
                                <div key={i} className="border-r border-b border-slate-200/50 flex items-start justify-start relative">
                                    <div className="absolute top-0 left-0 w-2.5 h-2.5 bg-slate-200/80 rounded-full -translate-x-1/2 -translate-y-1/2" />
                                </div>
                            ))}
                            {/* Final dots */}
                            {[...Array(9)].map((_, i) => <div key={`v-${i}`} className="absolute bottom-0 bg-slate-200/80 w-2.5 h-2.5 rounded-full -translate-x-1/2 translate-y-1/2" style={{ left: `${(i/8)*100}%` }} />)}
                            {[...Array(11)].map((_, i) => <div key={`h-${i}`} className="absolute right-0 bg-slate-200/80 w-2.5 h-2.5 rounded-full translate-x-1/2 -translate-y-1/2" style={{ top: `${(i/10)*100}%` }} />)}
                        </div>
                    </div>

                    {/* Reference Search Icon */}
                    <div className="absolute top-6 right-6 z-10">
                        <div className="w-10 h-10 bg-[#E8EBF4] rounded-full flex items-center justify-center text-[#5D6BB2] shadow-sm">
                            <Search size={20} strokeWidth={4} />
                        </div>
                    </div>

                    {/* Shapes SVG Layer */}
                    <div className="absolute inset-0 p-4">
                        <svg viewBox="0 0 800 1000" className="w-full h-full overflow-visible">
                            {nodes.map((node) => (
                                <g
                                    key={node.id}
                                    onClick={() => handleNodeClick(node)}
                                    className="cursor-pointer pointer-events-auto"
                                    style={{
                                        opacity: node.cleared ? 0 : 1,
                                        transition: 'opacity 200ms, transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                                        transform: node.exitProgress ? `translate(${node.dir === 'LEFT' ? -1500 : node.dir === 'RIGHT' ? 1500 : 0}px, ${node.dir === 'UP' ? -1500 : node.dir === 'DOWN' ? 1500 : 0}px)` : 'none'
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
    const rotations = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 };
    const getX = (x: number) => x * 100;
    const getY = (y: number) => y * 100;

    // 1. Calculate the Escape Path (Original points + a point far off-screen)
    const last = node.points[node.points.length - 1];
    const exitPoint = { x: last.x, y: last.y };
    if (node.dir === 'UP') exitPoint.y -= 15;
    else if (node.dir === 'DOWN') exitPoint.y += 15;
    else if (node.dir === 'LEFT') exitPoint.x -= 15;
    else exitPoint.x += 15;

    const fullPathPoints = [...node.points, exitPoint];

    // 2. Build the SVG Path String
    let pathD = `M ${getX(fullPathPoints[0].x)} ${getY(fullPathPoints[0].y)}`;
    fullPathPoints.forEach((p, i) => { if (i > 0) pathD += ` L ${getX(p.x)} ${getY(p.y)}`; });

    // 3. Calculate Lengths for "Snake" Animation
    const segments: number[] = [];
    for (let i = 0; i < node.points.length - 1; i++) {
        const p1 = node.points[i];
        const p2 = node.points[i+1];
        segments.push(Math.sqrt(Math.pow(getX(p2.x) - getX(p1.x), 2) + Math.pow(getY(p2.y) - getY(p1.y), 2)));
    }
    const bodyLength = segments.reduce((a, b) => a + b, 0);
    const totalPathLength = bodyLength + 1500; // body + exit distance

    // 4. Animation variants for the "Unraveling" effect
    const snakeVariants = {
        idle: { strokeDashoffset: 0, strokeDasharray: `${bodyLength} 10000` },
        exit: {
            strokeDashoffset: -(totalPathLength),
            strokeDasharray: `${bodyLength} 10000`,
            transition: { duration: 0.8, ease: "easeIn" }
        }
    };

    // Calculate Head and Tail positions for the icons to follow the path
    // For simplicity, we'll use a CSS motion path for the Head/Tail components
    const motionPath = `path('${pathD}')`;

    return (
        <g>
            <motion.path
                d={pathD}
                fill="none"
                stroke="#1a1a1a"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial="idle"
                animate={node.exitProgress ? "exit" : "idle"}
                variants={snakeVariants}
            />

            {/* Tail (Hollow Circle) - Follows the tracks */}
            <motion.circle
                r="12"
                fill="white"
                stroke="#1a1a1a"
                strokeWidth="8"
                style={{ offsetPath: motionPath, offsetDistance: "0%" }}
                animate={node.exitProgress ? {
                    offsetDistance: "100%",
                    transition: { duration: 0.8, ease: "easeIn" }
                } : {}}
            />

            {/* Head (Arrowhead) - Follows the tracks */}
            <motion.g
                animate={node.exitProgress ? {
                    offsetDistance: "100%",
                    transition: { duration: 0.8, ease: "easeIn" }
                } : {}}
                style={{
                    offsetPath: motionPath,
                    offsetDistance: `${(bodyLength / totalPathLength) * 100}%`,
                    offsetRotate: "auto 180deg" // auto-rotate the arrow to face forward
                }}
            >
                <path d="M -24 8 L 0 -36 L 24 8 Z" fill="#1a1a1a" />
            </motion.g>
        </g>
    );
}
