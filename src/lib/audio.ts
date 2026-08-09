// Neon Path - Background Music Engine
export class MusicEngine {
    private static instance: MusicEngine;
    private tracks: string[] = [];
    private currentIndex: number = 0;
    private audio: HTMLAudioElement | null = null;
    private isPlaying: boolean = false;

    constructor() {
        // Support both .mp3 and uppercase .MP3 naming
        this.tracks = Array.from({ length: 14 }, (_, i) => `/music/music${i + 1}.MP3`);
        this.shuffle();
    }

    public static getInstance(): MusicEngine {
        if (!MusicEngine.instance) {
            MusicEngine.instance = new MusicEngine();
        }
        return MusicEngine.instance;
    }

    private shuffle() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    }

    public start() {
        if (this.isPlaying) return;
        this.playNext();
    }

    private playNext() {
        if (this.audio) {
            this.audio.pause();
            this.audio.onended = null;
        }

        this.audio = new Audio(this.tracks[this.currentIndex]);
        this.audio.volume = 0.4; // Soft background music
        this.audio.play().catch(e => console.log("Music play blocked by browser policy. Interaction needed."));
        this.isPlaying = true;

        this.audio.onended = () => {
            this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
            if (this.currentIndex === 0) this.shuffle();
            this.playNext();
        };
    }

    public toggle() {
        if (!this.audio) return;
        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
        } else {
            this.audio.play();
            this.isPlaying = true;
        }
    }

    public setVolume(val: number) {
        if (this.audio) this.audio.volume = val;
    }
}

export const music = MusicEngine.getInstance();
