export interface Letter {
    char: string;
    x: number;
    y: number;
    width: number;
    createdAt: number;
    speed: number;
    color?: string;
    vx?: number; // horizontal velocity (px/frame)
    vy?: number; // vertical velocity (px/frame)
}