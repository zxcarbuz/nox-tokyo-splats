const shapes = {
  sliders: 'M3 6h7m4 0h7M3 17h11m4 0h3M10 3v6m4 5v6',
  rain: 'M5 14a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9M8 16l-1 3m6-3-1 3m6-3-1 3',
  traffic: 'm3 13 2-6h13l3 6v5H3zM4 13h16M6 18v2m12-2v2M6 15h2m8 0h2',
  pause: 'M8 5v14m8-14v14',
  light: 'M9 17h6m-5 3h4M8 12a6 6 0 1 1 8 0l-2 3h-4z',
  reset: 'M4 10a8 8 0 1 1 .5 6M4 4v6h6',
  orbit: 'M4 15c-2-3 2-7 7-10s10-2 10 1-2 7-7 10-9 3-10-1zM11 11h1',
} as const
type Icon = keyof typeof shapes
function icon(name: Icon) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    shapes[name] +
    '"/></svg>'
  )
}
export const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T
export type Toggle = 'rain' | 'traffic' | 'light' | 'pause'
export function setupControls() {
  document
    .querySelectorAll<HTMLElement>('[data-icon]')
    .forEach((node) => (node.innerHTML = icon(node.dataset.icon as Icon)))
  el('reset').innerHTML = icon('reset')
  const entries: [Toggle, string][] = [
    ['rain', 'Rainfall'],
    ['traffic', 'Traffic'],
    ['light', 'City lighting'],
    ['pause', 'Pause simulation'],
  ]
  entries.forEach(([id, label]) => {
    const button = document.createElement('button')
    button.id = id
    button.className = 'toggle'
    button.innerHTML =
      icon(id) + label + '<span aria-hidden="true" class="switch"></span>'
    el('toggles').appendChild(button)
  })
  const narrow = matchMedia('(max-width:780px)')
  const expand = (open: boolean) => {
    el('inspector').hidden = !open
    el('settings').setAttribute('aria-expanded', String(open))
    el('settings').textContent = open ? '−' : '+'
  }
  expand(!narrow.matches)
  narrow.addEventListener('change', () => expand(!narrow.matches))
  el('settings').onclick = () => expand(el('inspector').hidden)
}
