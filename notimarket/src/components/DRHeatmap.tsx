// src/components/DRHeatmap.tsx
// Real SVG province shapes heatmap for the Dominican Republic.
// Uses the actual dr-map.svg paths for geographic accuracy.

import { useMemo, useState, useRef } from 'react'
import rawSvg from '../assets/dr-map.svg?raw'
import type { ProvinceHeatmapDatum } from '../types'

type ColorScheme = 'voters' | 'news'

// ── Province code mapping (app codes → SVG path IDs) ──────────────────────────
const CODE_TO_SVG: Record<string, string> = {
  MCI: 'DO-15', DAJ: 'DO-05', VAL: 'DO-27', SRO: 'DO-26',
  EPI: 'DO-07', PUP: 'DO-18', ESP: 'DO-09', HMI: 'DO-19',
  MTS: 'DO-14', SAM: 'DO-20', STI: 'DO-25', LAV: 'DO-13',
  MNO: 'DO-28', SRA: 'DO-24', DUA: 'DO-06', SJU: 'DO-22',
  AZU: 'DO-02', PER: 'DO-17', SCR: 'DO-21', MOP: 'DO-29',
  ELS: 'DO-08', HAM: 'DO-30', SPM: 'DO-23', LRO: 'DO-12',
  ALG: 'DO-11', DNL: 'DO-01', SDQ: 'DO-32', IND: 'DO-10',
  BAH: 'DO-03', BAR: 'DO-04', PED: 'DO-16', SJO: 'DO-31',
}
const SVG_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_SVG).map(([code, id]) => [id, code])
)

interface ProvincePath {
  id: string
  title: string
  d: string
  code: string
}

interface TooltipState {
  x: number
  y: number
  name: string
  count: number
}

interface Props {
  data: ProvinceHeatmapDatum[]
  colorScheme: ColorScheme
  title?: string
}

// ── Smooth heat color interpolation ──────────────────────────────────────────
const VOTER_STOPS: [number, number, number][] = [
  [15, 52, 80],   // near-zero: deep navy
  [22, 78, 99],   // #164e63
  [8, 145, 178],  // #0891b2
  [6, 182, 212],  // #06b6d4
  [34, 211, 238], // #22d3ee – max
]
const NEWS_STOPS: [number, number, number][] = [
  [55, 20, 120],  // near-zero: deep purple
  [76, 29, 149],  // #4c1d95
  [124, 58, 237], // #7c3aed
  [249, 115, 22], // #f97316
  [239, 68, 68],  // #ef4444 – max
]

function heatColor(t: number, scheme: ColorScheme): string {
  const stops = scheme === 'voters' ? VOTER_STOPS : NEWS_STOPS
  if (t <= 0) return `rgb(${stops[0][0]},${stops[0][1]},${stops[0][2]})`
  const idx = Math.min(t, 1) * (stops.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, stops.length - 1)
  const f = idx - lo
  const s0 = stops[lo], s1 = stops[hi]
  return `rgb(${Math.round(s0[0] + (s1[0] - s0[0]) * f)},${Math.round(s0[1] + (s1[1] - s0[1]) * f)},${Math.round(s0[2] + (s1[2] - s0[2]) * f)})`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DRHeatmap({ data, colorScheme, title }: Props) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse province paths from the raw SVG (runs once)
  const provinces = useMemo<ProvincePath[]>(() => {
    const doc = new DOMParser().parseFromString(rawSvg, 'image/svg+xml')
    return Array.from(doc.querySelectorAll('path')).flatMap(path => {
      const id = path.getAttribute('id') ?? ''
      if (!id.startsWith('DO-')) return []
      return [{
        id,
        title: path.getAttribute('title') ?? id,
        d: path.getAttribute('d') ?? '',
        code: SVG_TO_CODE[id] ?? '',
      }]
    })
  }, [])

  // Aggregate data by province code
  const { byCode, maxCount } = useMemo(() => {
    const byCode: Record<string, number> = {}
    let maxCount = 1
    data.forEach(({ province, count }) => {
      if (!province) return
      const c = province.toUpperCase()
      byCode[c] = (byCode[c] ?? 0) + count
      if (byCode[c] > maxCount) maxCount = byCode[c]
    })
    return { byCode, maxCount }
  }, [data])

  const getIntensity = (code: string) => Math.min((byCode[code] ?? 0) / maxCount, 1)
  const getCount    = (code: string) => byCode[code] ?? 0
  const unit = colorScheme === 'voters' ? 'escaneos' : 'noticias'

  const headerTitle = title ?? (
    colorScheme === 'voters'
      ? '🗺️ Mapa de Calor – Escaneos QR por Provincia'
      : '🗺️ Mapa de Calor – Actividad de Noticias por Provincia'
  )

  // Theme-aware base colors
  const ocean       = isDark ? '#060e1c' : '#b8d4eb'
  const noDataFill  = isDark ? '#0f2744' : '#d4e5f5'
  const noDataStroke = isDark ? '#1a3555' : '#9ab8d0'
  const hoverStroke = isDark ? '#ffffff' : '#0f172a'
  const activeStroke = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)'

  const legends = colorScheme === 'voters'
    ? [
        { label: 'Sin datos', color: noDataFill },
        { label: 'Baja',      color: '#164e63' },
        { label: 'Media',     color: '#0891b2' },
        { label: 'Alta',      color: '#06b6d4' },
        { label: 'Máxima',    color: '#22d3ee' },
      ]
    : [
        { label: 'Sin datos', color: noDataFill },
        { label: 'Baja',      color: '#4c1d95' },
        { label: 'Media',     color: '#7c3aed' },
        { label: 'Alta',      color: '#f97316' },
        { label: 'Máxima',    color: '#ef4444' },
      ]

  const rankedProvinces = [...provinces]
    .filter(p => getCount(p.code) > 0)
    .sort((a, b) => getCount(b.code) - getCount(a.code))
    .slice(0, 8)

  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>, prov: ProvincePath) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name: prov.title, count: getCount(prov.code) })
    setHoveredId(prov.id)
  }
  const handleMouseLeave = () => { setTooltip(null); setHoveredId(null) }

  return (
    <div className="heatmap-wrapper">

      {/* ── Header + Legend ── */}
      <div className="heatmap-header">
        <span className="panel-title" style={{ marginBottom: 0 }}>{headerTitle}</span>
        <div className="heatmap-legend">
          {legends.map(l => (
            <span key={l.label} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: l.color, border: `1px solid ${isDark ? '#1e3a5f' : '#7da9c5'}` }}
              />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Map + Sidebar ── */}
      <div className="heatmap-container">

        {/* SVG Map */}
        <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <svg
            viewBox="0 0 792.71484 556.42358"
            className="heatmap-svg"
            aria-label="Mapa de calor República Dominicana"
            style={{ width: '100%', height: 'auto', background: ocean, borderRadius: 10, display: 'block' }}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              {/* Glow for hovered high-intensity provinces */}
              <filter id="dr-glow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Subtle inner shadow for depth */}
              <filter id="dr-shadow" x="-5%" y="-5%" width="110%" height="110%">
                <feDropShadow dx="1" dy="2" stdDeviation="3" floodColor={isDark ? '#000' : '#4a7090'} floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Province paths */}
            {provinces.map(prov => {
              const intensity  = getIntensity(prov.code)
              const hasData    = intensity > 0
              const isHovered  = hoveredId === prov.id
              const fill       = hasData ? heatColor(intensity, colorScheme) : noDataFill
              const stroke     = isHovered ? hoverStroke : hasData ? activeStroke : noDataStroke
              const strokeW    = isHovered ? 2.5 : hasData ? 1.0 : 0.6
              const opacity    = isHovered ? 1 : hasData ? 0.88 : 0.75
              const filter     = isHovered && hasData
                ? 'url(#dr-glow)'
                : !isHovered && hasData
                  ? 'url(#dr-shadow)'
                  : undefined

              return (
                <path
                  key={prov.id}
                  d={prov.d}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={stroke}
                  strokeWidth={strokeW}
                  strokeLinejoin="round"
                  filter={filter}
                  style={{ cursor: 'pointer', transition: 'fill 0.2s ease, fill-opacity 0.15s ease' }}
                  onMouseMove={e => handleMouseMove(e, prov)}
                  onMouseLeave={handleMouseLeave}
                >
                  <title>
                    {prov.title}
                    {getCount(prov.code) > 0
                      ? ` • ${getCount(prov.code).toLocaleString('es-DO')} ${unit}`
                      : ' • Sin datos'}
                  </title>
                </path>
              )
            })}
          </svg>

          {/* Floating tooltip */}
          {tooltip && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(tooltip.x + 14, (containerRef.current?.clientWidth ?? 500) - 170),
                top: tooltip.y + 14,
                background: isDark ? '#0c1a2e' : '#ffffff',
                border: `1px solid ${isDark ? '#1e3a5f' : '#c5daea'}`,
                borderRadius: 9,
                padding: '9px 14px',
                pointerEvents: 'none',
                boxShadow: isDark
                  ? '0 6px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)'
                  : '0 6px 20px rgba(0,0,0,0.12)',
                zIndex: 20,
                minWidth: 148,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.83rem', color: isDark ? '#e2e8f0' : '#1e293b', lineHeight: 1.3 }}>
                {tooltip.name}
              </div>
              <div style={{
                fontSize: '0.74rem',
                color: tooltip.count > 0
                  ? (colorScheme === 'voters' ? '#22d3ee' : '#f97316')
                  : (isDark ? '#4e6a8a' : '#94a3b8'),
                marginTop: 4,
                fontWeight: tooltip.count > 0 ? 600 : 400,
              }}>
                {tooltip.count > 0
                  ? `${tooltip.count.toLocaleString('es-DO')} ${unit}`
                  : 'Sin datos'}
              </div>
            </div>
          )}
        </div>

        {/* Ranking sidebar */}
        <div className="province-list">
          {rankedProvinces.length > 0 && (
            <div style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isDark ? '#4e6a8a' : '#7a9bb5',
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: `1px solid ${isDark ? '#1a3555' : '#d0e5f2'}`,
            }}>
              Top provincias
            </div>
          )}
          {rankedProvinces.map((prov, i) => {
            const count = getCount(prov.code)
            const intensity = getIntensity(prov.code)
            return (
              <div key={prov.code || prov.id} className="province-row">
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: isDark ? '#4e6a8a' : '#94a3b8',
                  width: 14,
                  flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <span
                  className="province-dot-sm"
                  style={{ background: heatColor(intensity, colorScheme), flexShrink: 0 }}
                />
                <span className="province-row-name">{prov.title}</span>
                <span className="province-row-votes">
                  {count.toLocaleString('es-DO')} {unit}
                </span>
              </div>
            )
          })}
          {Object.keys(byCode).length === 0 && (
            <p style={{
              fontSize: '0.8rem',
              color: isDark ? '#4e6a8a' : '#7a9bb5',
              textAlign: 'center',
              padding: '20px 0',
              lineHeight: 1.6,
            }}>
              Sin datos por provincia.<br />
              <span style={{ fontSize: '0.72rem' }}>
                Aparecerán cuando haya escaneos QR o encuestas con provincia asignada.
              </span>
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
