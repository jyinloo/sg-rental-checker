import { useState } from 'react'
import { fetchHdbRentals } from './api'
import { fetchUraRentalMedian } from './uraApi'
import './App.css'

const PLANNING_AREAS = [
  'Ang Mo Kio', 'Bedok', 'Bishan', 'Boon Lay', 'Bukit Batok',
  'Bukit Merah', 'Bukit Panjang', 'Bukit Timah', 'Central Area',
  'Choa Chu Kang', 'Clementi', 'Geylang', 'Hougang', 'Jurong East',
  'Jurong West', 'Kallang', 'Marine Parade', 'Novena', 'Pasir Ris',
  'Punggol', 'Queenstown', 'Sembawang', 'Sengkang', 'Serangoon',
  'Tampines', 'Toa Payoh', 'Woodlands', 'Yishun',
]

const ROOM_MIN = 1
const ROOM_MAX = 5

function roomLabel(count) {
  return `${count}-Room`
}

function formatSgd(amount) {
  return `S$${amount.toLocaleString('en-SG')}`
}

function formatSgdShort(amount) {
  return `$${amount.toLocaleString('en-SG')}`
}

const BAR_MIN = 40  // px — height of the lowest bar
const BAR_MAX = 100 // px — height of the highest bar

function barHeights(low, mid, high) {
  const range = high - low
  const scale = range === 0 ? 0 : (BAR_MAX - BAR_MIN) / range
  return {
    low:    BAR_MIN,
    median: Math.round(BAR_MIN + (mid - low) * scale),
    high:   BAR_MAX,
  }
}

function formatMonth(yyyyMm) {
  if (!yyyyMm) return '—'
  const [year, month] = yyyyMm.split('-')
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })
}

export default function App() {
  const [propertyType, setPropertyType] = useState('hdb')
  const [location, setLocation] = useState('')
  const [roomCount, setRoomCount] = useState(3)

  // status: 'idle' | 'loading' | 'hdb-success' | 'ura-success' | 'error' | 'empty'
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const canSearch = location !== ''

  const hdbBars = status === 'hdb-success' && results
    ? barHeights(results.p25, results.median, results.p75)
    : null

  const uraBars = status === 'ura-success' && results
    ? barHeights(results.rentLow, results.estimatedRent, results.rentHigh)
    : null

  async function handleSearch() {
    if (!canSearch) return

    setStatus('loading')
    setResults(null)
    setErrorMsg('')

    const rooms = roomLabel(roomCount)

    try {
      if (propertyType === 'hdb') {
        const data = await fetchHdbRentals(location, rooms)
        if (data === null) {
          setStatus('empty')
        } else {
          setResults(data)
          setStatus('hdb-success')
        }
      } else {
        const data = await fetchUraRentalMedian(location, rooms)
        if (data === null) {
          setStatus('empty')
        } else {
          setResults(data)
          setStatus('ura-success')
        }
      }
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message ?? 'Something went wrong.')
      setStatus('error')
    }
  }

  const currentRooms = roomLabel(roomCount)

  return (
    <div className="app">
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-content">
          <h1 className="hero-heading">Is your rent fair? Let's check the numbers.</h1>

          {/* ── Filters ── */}
          <div className="filters">

            {/* Property Type */}
            <div className="filter-row">
              <span className="filter-label">Type</span>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${propertyType === 'hdb' ? 'active' : ''}`}
                  onClick={() => setPropertyType('hdb')}
                >
                  HDB
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${propertyType === 'private' ? 'active' : ''}`}
                  onClick={() => setPropertyType('private')}
                >
                  Private
                </button>
              </div>
            </div>

            {/* Location */}
            <div className="filter-row">
              <label className="filter-label" htmlFor="location">Area</label>
              <div className="select-wrapper">
                <select
                  id="location"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                >
                  <option value="">Select area…</option>
                  {PLANNING_AREAS.map(area => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
                <span className="select-chevron" aria-hidden="true">&#8964;</span>
              </div>
            </div>

            {/* Rooms — stepper */}
            <div className="filter-row">
              <span className="filter-label">Rooms</span>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label="Decrease rooms"
                  onClick={() => setRoomCount(c => Math.max(ROOM_MIN, c - 1))}
                  disabled={roomCount <= ROOM_MIN}
                >
                  −
                </button>
                <span className="stepper-value">{roomCount}-Room</span>
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label="Increase rooms"
                  onClick={() => setRoomCount(c => Math.min(ROOM_MAX, c + 1))}
                  disabled={roomCount >= ROOM_MAX}
                >
                  +
                </button>
              </div>
            </div>

          </div>
        </div>
      </section>

      <main className="main">
        {/* Search Button */}
        <button
          type="button"
          className="search-btn"
          onClick={handleSearch}
          disabled={!canSearch || status === 'loading'}
        >
          {status === 'loading'
            ? <span style={{ color: '#E2743C' }}>Crunching the numbers<span className="loading-dots"><span>.</span><span>.</span><span>.</span></span></span>
            : 'Check rent price'
          }
        </button>

        {!canSearch && status === 'idle' && (
          <p className="hint">Select an area to check rental prices</p>
        )}

        {/* Loading skeleton */}
        {status === 'loading' && (
          <div className="result-card loading-card">
            <div className="skeleton-line wide" />
            <div className="bar-chart">
              <div className="bar-col"><div className="skeleton-stat" style={{ height: '55px', width: '100%' }} /></div>
              <div className="bar-col"><div className="skeleton-stat" style={{ height: '75px', width: '100%' }} /></div>
              <div className="bar-col"><div className="skeleton-stat" style={{ height: '89px', width: '100%' }} /></div>
            </div>
            <div className="skeleton-line medium" />
            <div className="skeleton-line wide" />
          </div>
        )}

        {/* HDB result */}
        {status === 'hdb-success' && results && hdbBars && (
          <div className="result-card">
            <p className="result-heading">
              {location} <span className="result-sep">|</span> {currentRooms} <span className="result-sep">|</span> HDB
            </p>

            <div className="bar-chart">
              {/* Low */}
              <div className="bar-col">
                <div className="bar-col-label">
                  <span className="bar-price bar-price--secondary">{formatSgdShort(results.p25)}</span>
                  <div className="bar-tag">
                    <span className="bar-arrow">↓</span>
                    <span className="bar-tag-text">low</span>
                  </div>
                </div>
                <div className="bar bar--secondary" style={{ height: `${hdbBars.low}px` }} />
              </div>

              {/* Median */}
              <div className="bar-col">
                <div className="bar-col-label">
                  <span className="bar-price bar-price--median">{formatSgdShort(results.median)}</span>
                  <span className="bar-tag-text bar-tag-text--median">median</span>
                </div>
                <div className="bar bar--median" style={{ height: `${hdbBars.median}px` }} />
              </div>

              {/* High */}
              <div className="bar-col">
                <div className="bar-col-label">
                  <span className="bar-price bar-price--secondary">{formatSgdShort(results.p75)}</span>
                  <div className="bar-tag">
                    <span className="bar-arrow">↑</span>
                    <span className="bar-tag-text">high</span>
                  </div>
                </div>
                <div className="bar bar--secondary" style={{ height: `${hdbBars.high}px` }} />
              </div>
            </div>

            <p className="result-description">
              Most tenants paid between{' '}
              <span className="result-highlight">{formatSgd(results.p25)} – {formatSgd(results.p75)}/month.</span>
              {' '}Based on {results.count} approved HDB rental applications in {location},{' '}
              {formatMonth(results.fromMonth)} – {formatMonth(results.toMonth)}. Source: data.gov.sg
            </p>
          </div>
        )}

        {/* URA / Private result */}
        {status === 'ura-success' && results && uraBars && (
          <div className="result-card">
            <p className="result-heading">
              {location} <span className="result-sep">|</span> {results.bedroomLabel} <span className="result-sep">|</span> Condo
            </p>

            <div className="bar-chart">
              {/* Low */}
              <div className="bar-col">
                <div className="bar-col-label">
                  <span className="bar-price bar-price--secondary">{formatSgdShort(results.rentLow)}</span>
                  <div className="bar-tag">
                    <span className="bar-arrow">↓</span>
                    <span className="bar-tag-text">low</span>
                  </div>
                </div>
                <div className="bar bar--secondary" style={{ height: `${uraBars.low}px` }} />
              </div>

              {/* Median */}
              <div className="bar-col">
                <div className="bar-col-label">
                  <span className="bar-price bar-price--median">{formatSgdShort(results.estimatedRent)}</span>
                  <span className="bar-tag-text bar-tag-text--median">median</span>
                </div>
                <div className="bar bar--median" style={{ height: `${uraBars.median}px` }} />
              </div>

              {/* High */}
              <div className="bar-col">
                <div className="bar-col-label">
                  <span className="bar-price bar-price--secondary">{formatSgdShort(results.rentHigh)}</span>
                  <div className="bar-tag">
                    <span className="bar-arrow">↑</span>
                    <span className="bar-tag-text">high</span>
                  </div>
                </div>
                <div className="bar bar--secondary" style={{ height: `${uraBars.high}px` }} />
              </div>
            </div>

            <p className="result-description">
              Estimated median rent is{' '}
              <span className="result-highlight">{formatSgd(results.rentLow)} – {formatSgd(results.rentHigh)}/month.</span>
              {' '}Based on URA median PSF ({results.medianPsf} psf) × typical {results.bedroomLabel.toLowerCase()} size (~{results.sqft} sqft),
              across {results.projectCount} project{results.projectCount !== 1 ? 's' : ''} in{' '}
              District{results.districts.length > 1 ? 's' : ''} {results.districts.map(Number).join(', ')}, {results.refPeriod}. Source: URA Data Service
            </p>
          </div>
        )}

        {status === 'empty' && (
          <div className="result-card empty-card">
            <p className="empty-icon">🔍</p>
            <p className="empty-title">No data found</p>
            <p className="empty-body">
              No rental records for <strong>{currentRooms}</strong> in <strong>{location}</strong>.
              Try a different area or room type.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="result-card error-card">
            <p className="empty-icon">⚠️</p>
            <p className="empty-title">Could not fetch data</p>
            <p className="empty-body">{errorMsg}</p>
            <button type="button" className="retry-btn" onClick={handleSearch}>
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
