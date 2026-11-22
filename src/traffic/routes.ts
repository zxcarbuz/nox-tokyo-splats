export const SIDES = ['north', 'east', 'south', 'west'] as const
export type Side = (typeof SIDES)[number]

export interface RouteSample {
  x: number
  z: number
  heading: number
}

export function wrap(value: number, length: number): number {
  return ((value % length) + length) % length
}

export function createRingRoute(edge: number, cornerRadius: number) {
  const straight = (edge - cornerRadius) * 2
  const quarterArc = (Math.PI * cornerRadius) / 2
  const sideLength = straight + quarterArc
  const length = sideLength * 4

  function sample(distance: number): RouteSample {
    const position = wrap(distance, length)
    const side = Math.floor(position / sideLength)
    const sidePosition = position - side * sideLength
    const rotation = (side * Math.PI) / 2
    const turn = Math.max(0, (sidePosition - straight) / cornerRadius)
    const localX =
      sidePosition < straight
        ? -edge + cornerRadius + sidePosition
        : edge - cornerRadius + cornerRadius * Math.sin(turn)
    const localZ = -edge + cornerRadius * (1 - Math.cos(turn))
    const cosine = Math.cos(rotation)
    const sine = Math.sin(rotation)
    return {
      x: localX * cosine - localZ * sine,
      z: localX * sine + localZ * cosine,
      heading: Math.PI / 2 - rotation - turn,
    }
  }

  return {
    sample,
    length,
    gate: (side: number) => side * sideLength + straight / 2,
  }
}

export const SIDEWALKS = [createRingRoute(8.73, 0.22), createRingRoute(13.65, 0.69)] as const
