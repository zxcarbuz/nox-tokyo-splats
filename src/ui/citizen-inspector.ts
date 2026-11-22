import { el } from './controls'
import type { CityEvent } from '../traffic/events'

interface CandidateScore {
  action: string
  poiName: string
  score: number
  reason: string
  available: boolean
}

interface InspectorCitizen {
  id: number
  profile: { name: string }
  needs: { hunger: number; energy: number; leisure: number }
  goal: { action: string; poi: { name: string }; reason: string } | null
  lastDecision: { reason: string; scores: readonly CandidateScore[] } | null
}

export interface CitizenInspectorSnapshot {
  citizens: readonly InspectorCitizen[]
  events: readonly CityEvent[]
}

const template = `
  <header class="paneltitle citizen-inspector-header">
    <h2 id="citizen-inspector-title">Citizen Inspector</h2>
    <div class="citizen-export-actions">
      <button class="preset citizen-inspector-button" id="citizen-copy" type="button" disabled>Copy JSON</button>
      <button class="preset citizen-inspector-button" id="citizen-export" type="button" disabled>Export JSON</button>
    </div>
    <p class="citizen-export-status" id="citizen-export-status" role="status" hidden></p>
  </header>
  <div class="citizen-inspector-grid">
    <div class="citizen-profile">
      <label class="citizen-field" for="citizen-select">Citizen
        <select id="citizen-select" disabled></select>
      </label>
      <p class="citizen-empty" id="citizen-loading">Waiting for simulation data…</p>
      <div id="citizen-profile-data" hidden>
        <section class="citizen-section" aria-labelledby="citizen-needs-label">
          <h3 id="citizen-needs-label">Current needs</h3>
          <dl class="citizen-needs" id="citizen-needs"></dl>
        </section>
        <section class="citizen-section" aria-labelledby="citizen-goal-label">
          <h3 id="citizen-goal-label">Current goal</h3>
          <p class="citizen-goal" id="citizen-goal"></p>
          <p class="citizen-reason" id="citizen-reason"></p>
        </section>
        <section class="citizen-section" aria-labelledby="citizen-scores-label">
          <h3 id="citizen-scores-label">Last decision scores</h3>
          <p class="citizen-empty" id="citizen-scores-empty">Waiting for a decision…</p>
          <ul class="citizen-score-list" id="citizen-scores"></ul>
        </section>
      </div>
    </div>
    <section class="citizen-journal" aria-labelledby="citizen-journal-title">
      <h3 id="citizen-journal-title">Event journal</h3>
      <div class="citizen-journal-filters">
        <label class="citizen-field" for="citizen-search">Search events
          <input type="search" id="citizen-search" spellcheck="false" autocomplete="off">
        </label>
        <label class="citizen-field" for="citizen-scope">Event scope
          <select id="citizen-scope">
            <option value="all">All citizens</option>
            <option value="citizen">Selected citizen</option>
          </select>
        </label>
      </div>
      <p class="citizen-empty" id="citizen-events-empty">Waiting for simulation data…</p>
      <ol class="citizen-events" id="citizen-events" aria-label="Simulation events, newest first"></ol>
    </section>
  </div>
`

function textNode<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className?: string) {
  const node = document.createElement(tag)
  node.textContent = value
  if (className) node.className = className
  return node
}

function titleCase(value: string) {
  const label = value.replace(/[_-]/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatTime(seconds: number) {
  const deciseconds = Math.round(seconds * 10)
  const minutes = Math.floor(deciseconds / 600)
  const remaining = ((deciseconds % 600) / 10).toFixed(1).padStart(4, '0')
  return `${minutes}:${remaining}`
}

function needRow(label: string, value: number) {
  const row = document.createElement('div')
  row.className = 'citizen-need'
  const description = document.createElement('dd')
  const meter = document.createElement('meter')
  meter.min = 0
  meter.max = 100
  meter.value = value
  meter.setAttribute('aria-hidden', 'true')
  description.append(meter, textNode('span', `${Math.round(value)}%`, 'citizen-need-value'))
  row.append(textNode('dt', label), description)
  return row
}

function scoreRow(candidate: CandidateScore) {
  const row = document.createElement('li')
  row.className = 'citizen-score'
  const score = candidate.available && Number.isFinite(candidate.score)
    ? candidate.score.toFixed(2) : 'Unavailable'
  row.append(
    textNode('span', `${titleCase(candidate.action)} · ${candidate.poiName}`),
    textNode('span', score, 'citizen-score-value'),
  )
  if (!candidate.available && candidate.reason) {
    row.append(textNode('span', candidate.reason, 'citizen-score-reason'))
  }
  return row
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Offline and sandboxed browsers may only provide the older copy command.
    }
  }
  const active = document.activeElement
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.className = 'citizen-clipboard-field'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
    if (active instanceof HTMLElement) active.focus({ preventScroll: true })
  }
}

export function setupCitizenInspector(): ((data: CitizenInspectorSnapshot) => void) | null {
  if (new URLSearchParams(location.search).get('debug') !== 'events') return null

  const panel = document.createElement('section')
  panel.id = 'citizen-inspector'
  panel.className = 'citizen-inspector'
  panel.setAttribute('aria-labelledby', 'citizen-inspector-title')
  panel.innerHTML = template
  document.querySelector('.workspace')?.after(panel)

  const select = el<HTMLSelectElement>('citizen-select')
  const scope = el<HTMLSelectElement>('citizen-scope')
  const search = el<HTMLInputElement>('citizen-search')
  const events = el<HTMLOListElement>('citizen-events')
  const exportButton = el<HTMLButtonElement>('citizen-export')
  const copyButton = el<HTMLButtonElement>('citizen-copy')
  const status = el('citizen-export-status')
  let snapshot: CitizenInspectorSnapshot | undefined
  let visibleEvents: CityEvent[] = []
  let rosterKey = ''
  let profileKey = ''
  let journalKey = ''

  function citizenLabel(id: number) {
    const citizen = snapshot?.citizens.find((entry) => entry.id === id)
    return citizen ? `${citizen.profile.name} · NPC ${id}` : `NPC ${id}`
  }

  function renderProfile() {
    const citizen = snapshot?.citizens.find((entry) => entry.id === Number(select.value))
    el('citizen-loading').hidden = Boolean(citizen)
    el('citizen-loading').textContent = snapshot ? 'No experimental citizens are available.' : 'Waiting for simulation data…'
    el('citizen-profile-data').hidden = !citizen
    if (!citizen) return

    const { id, goal, needs, lastDecision } = citizen
    const key = JSON.stringify([id, needs, goal?.action, goal?.poi.name, goal?.reason, lastDecision])
    if (key === profileKey) return
    profileKey = key

    el('citizen-needs').replaceChildren(
      needRow('Hunger', needs.hunger), needRow('Energy', needs.energy), needRow('Leisure', needs.leisure),
    )
    el('citizen-goal').textContent = goal ? `${titleCase(goal.action)} · ${goal.poi.name}` : 'No active goal'
    el('citizen-reason').textContent = goal?.reason ?? (lastDecision ? `Last decision · ${lastDecision.reason}` : '')
    const scores = (lastDecision?.scores ?? []).map(scoreRow)
    el('citizen-scores-empty').hidden = scores.length > 0
    el('citizen-scores').replaceChildren(...scores)
  }

  function renderJournal(resetScroll = false) {
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    visibleEvents = [...(snapshot?.events ?? [])].reverse().filter((event) => {
      if (scope.value === 'citizen' && event.npcId !== Number(select.value)) return false
      if (!words.length) return true
      const text = [citizenLabel(event.npcId), event.type, titleCase(event.type), event.goal ?? '',
        titleCase(event.goal ?? ''), event.poi ?? '', titleCase(event.poi ?? ''), event.reason,
        formatTime(event.time)].join(' ').toLocaleLowerCase()
      return words.every((word) => text.includes(word))
    })

    const empty = el('citizen-events-empty')
    empty.hidden = visibleEvents.length > 0
    empty.textContent = snapshot
      ? snapshot.events.length ? 'No events match these filters.' : 'Events will appear as the simulation runs.'
      : 'Waiting for simulation data…'
    if (resetScroll) events.scrollTop = 0
    const key = `${rosterKey}|${visibleEvents.map((event) => event.id).join(',')}`
    if (key === journalKey) return
    journalKey = key
    const scroll = events.scrollTop
    const previousFirst = events.firstElementChild
    const rows = visibleEvents.map((event) => {
      const row = document.createElement('li')
      row.className = 'citizen-event'
      row.dataset.eventId = String(event.id)
      row.dataset.npcId = String(event.npcId)
      row.dataset.eventType = event.type
      const time = textNode('time', formatTime(event.time), 'citizen-event-time')
      time.dateTime = `PT${event.time}S`
      const label = [citizenLabel(event.npcId), titleCase(event.type), event.goal && titleCase(event.goal),
        event.poi && titleCase(event.poi)].filter(Boolean).join(' · ')
      row.append(time, textNode('span', label))
      if (event.reason) row.append(textNode('span', event.reason, 'citizen-event-reason'))
      return row
    })
    events.replaceChildren(...rows)
    events.tabIndex = rows.length ? 0 : -1
    if (scroll > 0) {
      const anchor = rows.find((row) => row.dataset.eventId === (previousFirst as HTMLElement | null)?.dataset.eventId)
      events.scrollTop = scroll + (anchor?.offsetTop ?? 0)
    }
  }

  select.addEventListener('change', () => {
    renderProfile()
    renderJournal(scope.value === 'citizen')
  })
  scope.addEventListener('change', () => renderJournal(true))
  search.addEventListener('input', () => renderJournal(true))

  function report(message: string) {
    status.hidden = false
    status.textContent = message
  }
  function journalJSON() {
    return JSON.stringify(visibleEvents, null, 2)
  }
  copyButton.addEventListener('click', async () => {
    const count = visibleEvents.length
    report(await copyText(journalJSON()) ? `Copied ${count} ${count === 1 ? 'event' : 'events'}.` : 'Clipboard unavailable. Use Export JSON.')
  })
  exportButton.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([journalJSON()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'nox-citizen-events.json'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })

  return (data) => {
    snapshot = data
    const key = JSON.stringify(data.citizens.map(({ id, profile }) => [id, profile.name]))
    if (key !== rosterKey) {
      rosterKey = key
      const selected = select.value
      select.replaceChildren(...data.citizens.map(({ id }) => new Option(citizenLabel(id), String(id))))
      if (data.citizens.some(({ id }) => String(id) === selected)) select.value = selected
      select.disabled = data.citizens.length === 0
    }
    copyButton.disabled = false
    exportButton.disabled = false
    renderProfile()
    renderJournal()
  }
}
