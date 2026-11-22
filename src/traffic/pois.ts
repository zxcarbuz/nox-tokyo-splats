import { SIDEWALKS } from './routes'

export type PoiAction = 'eat' | 'buy_food' | 'rest' | 'leisure_walk'
export type PoiType = 'food' | 'shop' | 'rest' | 'leisure'
export type PoiEffect = Partial<Readonly<{ hunger: number; energy: number; leisure: number }>>

interface PoiSite {
  readonly id: string
  readonly name: string
  readonly type: PoiType
  readonly action: PoiAction
  readonly sidewalk: 0 | 1
  readonly side: 0 | 1 | 2 | 3
  /** Signed distance along the rail's forward direction from this side's crossing. */
  readonly along: number
  readonly heading: number
  readonly capacity: number
  /** Seconds at the destination, after approaching on the sidewalk. */
  readonly duration: number
  readonly effect: PoiEffect
  readonly availability: 'always' | 'dry'
}

export interface PointOfInterest extends PoiSite {
  readonly distance: number
  readonly x: number
  readonly z: number
}

// These standing slots use the sidewalk rails. Each admits one visitor so a
// second visitor cannot stack in the same spot or queue beside a crossing.
const sites: readonly PoiSite[] = [
  {
    id: 'tsukimiken', name: 'Tsukimiken', type: 'food', action: 'eat',
    sidewalk: 0, side: 2, along: -3.48, heading: Math.PI,
    capacity: 1, duration: 8, effect: { hunger: -62 }, availability: 'always',
  },
  {
    id: 'south-coffee-stand', name: 'South Coffee Stand', type: 'food', action: 'eat',
    sidewalk: 0, side: 2, along: 3.65, heading: Math.PI,
    capacity: 1, duration: 6.5, effect: { hunger: -46, energy: 10 }, availability: 'always',
  },
  {
    id: 'aoba-mart', name: 'Aoba Mart', type: 'shop', action: 'buy_food',
    sidewalk: 0, side: 1, along: 7.78, heading: -Math.PI / 2,
    capacity: 1, duration: 5, effect: { hunger: -40 }, availability: 'always',
  },
  {
    id: 'north-vending', name: 'North 24h Vending', type: 'shop', action: 'buy_food',
    sidewalk: 0, side: 0, along: 4.61, heading: 0,
    capacity: 1, duration: 4, effect: { hunger: -33 }, availability: 'always',
  },
  {
    id: 'north-bench-pullout', name: 'North Bench Pullout', type: 'rest', action: 'rest',
    sidewalk: 1, side: 0, along: -8.97, heading: Math.atan2(1.17, -1.15),
    capacity: 1, duration: 8, effect: { energy: 55 }, availability: 'always',
  },
  {
    id: 'koi-overlook', name: 'Koi Overlook', type: 'leisure', action: 'leisure_walk',
    sidewalk: 1, side: 1, along: -4.6, heading: Math.atan2(5.18 - 13.65, -5.42 + 4.6),
    capacity: 1, duration: 3, effect: { leisure: 61 }, availability: 'always',
  },
  {
    id: 'west-neon-promenade', name: 'West Neon Promenade', type: 'leisure', action: 'leisure_walk',
    sidewalk: 1, side: 3, along: -4.9, heading: Math.PI / 2,
    capacity: 1, duration: 3.5, effect: { leisure: 67 }, availability: 'dry',
  },
]

export const POIS: readonly PointOfInterest[] = sites.map(site => {
  const route = SIDEWALKS[site.sidewalk]
  const distance = route.gate(site.side) + site.along
  const { x, z } = route.sample(distance)
  return { ...site, distance, x, z }
})

export function poiAvailable(poi: PointOfInterest, raining: boolean): boolean {
  return !raining || poi.availability === 'always'
}
