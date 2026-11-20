// One assigned user per seat. Both face the road from the outer pavement.
export const benches = [
  { id: 1, x: -7.8, z: -14.8, heading: 0, side: 0, duration: 10 },
  { id: 15, x: -14.8, z: -8, heading: Math.PI / 2, side: 3, duration: 12 },
] as const

export const seatTop = .42

// The walker turns in front of the slats, then moves the hips back over them.
export const sitBack = .36
export const approachSeconds = 1.5
export const sitSeconds = .95
