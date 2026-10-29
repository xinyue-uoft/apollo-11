// Unit conversions. The simulation is SI internally; Apollo displays and
// most historical sources use feet, ft/s, pounds and nautical miles.

export const FT = 0.3048;            // m per foot
export const FPS = 0.3048;           // (m/s) per (ft/s)
export const NMI = 1852;             // m per nautical mile
export const LB = 0.45359237;        // kg per pound (mass)
export const LBF = 4.4482216152605;  // N per pound-force
export const G0 = 9.80665;           // m/s^2, standard gravity (Isp)

export const MOON_RADIUS = 1737400;  // m, mean radius
export const MOON_MU = 4.9048695e12; // m^3/s^2

export const toFt = (m) => m / FT;
export const fromFt = (ft) => ft * FT;
export const toFps = (mps) => mps / FPS;
export const fromFps = (fps) => fps * FPS;
export const toNmi = (m) => m / NMI;
export const fromNmi = (nmi) => nmi * NMI;
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
