// URA Data Service — PMI_Resi_Rental_Median
// Docs: https://eservice.ura.gov.sg/maps/api/
//
// Flow:
//   1. Generate a daily token via insertNewToken/v1 (token valid 24 h)
//   2. Fetch the full PMI_Resi_Rental_Median dataset (all districts, past 3 yrs)
//   3. Filter client-side by the user's district(s) and pick the latest quarter
//
// Note: PMI_Resi_Rental_Median reports median PSF (S$ / sqft / month), not a
// monthly dollar figure. We multiply by typical unit sizes to estimate monthly
// rent based on the selected room type. This is an approximation — actual sizes
// vary by project.
//
// CORS: The URA API does not set CORS headers, so all calls are routed through
// the Vite dev-server proxy (/ura-api → https://eservice.ura.gov.sg). For
// production you need a server-side proxy or serverless function.

const ACCESS_KEY = import.meta.env.REACT_APP_URA_ACCESS_KEY

const TOKEN_ENDPOINT = '/ura-api/uraDataService/insertNewToken/v1'
const DATA_ENDPOINT =
  '/ura-api/uraDataService/invokeUraDS/v1?service=PMI_Resi_Rental_Median'

// sessionStorage keys for the cached daily token
const SK_TOKEN = 'ura_token'
const SK_TOKEN_TS = 'ura_token_ts'
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000 // refresh one hour before expiry

// Module-level cache for the bulk dataset (cleared on page reload)
let _dataCache = null

// ── Planning area → URA postal district(s) ───────────────────────────────────
// Districts are zero-padded 2-digit strings matching the API's "district" field.
export const AREA_TO_DISTRICTS = {
  'Ang Mo Kio':   ['20'],
  'Bedok':        ['16'],
  'Bishan':       ['20'],
  'Boon Lay':     ['22'],
  'Bukit Batok':  ['23'],
  'Bukit Merah':  ['03', '04'],
  'Bukit Panjang':['23'],
  'Bukit Timah':  ['10', '21'],
  'Central Area': ['01', '02', '06', '07', '08', '09'],
  'Choa Chu Kang':['23'],
  'Clementi':     ['05'],
  'Geylang':      ['14'],
  'Hougang':      ['19'],
  'Jurong East':  ['22'],
  'Jurong West':  ['22'],
  'Kallang':      ['12', '13', '14'],
  'Marine Parade':['15'],
  'Novena':       ['11'],
  'Pasir Ris':    ['18'],
  'Punggol':      ['19'],
  'Queenstown':   ['03'],
  'Sembawang':    ['27'],
  'Sengkang':     ['19'],
  'Serangoon':    ['13', '19'],
  'Tampines':     ['18'],
  'Toa Payoh':    ['12'],
  'Woodlands':    ['25', '26'],
  'Yishun':       ['27'],
}

// ── Room type → private condo equivalent + typical size ──────────────────────
// Used to convert PSF median into an estimated monthly rent.
export const ROOM_TO_CONDO = {
  '1-Room': { label: 'Studio',      sqft: 450  },
  '2-Room': { label: '1-Bedroom',   sqft: 600  },
  '3-Room': { label: '2-Bedroom',   sqft: 900  },
  '4-Room': { label: '3-Bedroom',   sqft: 1250 },
  '5-Room': { label: '4-Bedroom',   sqft: 1650 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function medianOf(sortedArr) {
  const mid = Math.floor(sortedArr.length / 2)
  return sortedArr.length % 2 === 0
    ? (sortedArr[mid - 1] + sortedArr[mid]) / 2
    : sortedArr[mid]
}

// Parse refPeriod strings like "24Q4" or "2024Q4" → { year: 2024, quarter: 4 }
function parseRefPeriod(ref) {
  const m = ref.match(/^(\d{2,4})Q(\d)$/)
  if (!m) return { year: 0, quarter: 0 }
  const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1])
  return { year, quarter: Number(m[2]) }
}

function latestRefPeriod(periods) {
  return [...periods].sort((a, b) => {
    const pa = parseRefPeriod(a)
    const pb = parseRefPeriod(b)
    if (pa.year !== pb.year) return pa.year - pb.year
    return pa.quarter - pb.quarter
  }).at(-1)
}

function formatRefPeriod(ref) {
  const { year, quarter } = parseRefPeriod(ref)
  return `Q${quarter} ${year}`
}

// ── Token management ──────────────────────────────────────────────────────────

async function getToken() {
  const token = sessionStorage.getItem(SK_TOKEN)
  const ts    = sessionStorage.getItem(SK_TOKEN_TS)

  if (token && ts && Date.now() - Number(ts) < TOKEN_TTL_MS) {
    return token
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    headers: { AccessKey: ACCESS_KEY },
  })

  if (!res.ok) {
    throw new Error(
      `Token generation failed (HTTP ${res.status}). ` +
      'Check that your URA access key is correct.'
    )
  }

  const json = await res.json()

  if (json.Status !== 'Success') {
    throw new Error(`URA token error: ${json.Message ?? 'Unknown error'}`)
  }

  sessionStorage.setItem(SK_TOKEN, json.Result)
  sessionStorage.setItem(SK_TOKEN_TS, String(Date.now()))
  return json.Result
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchAllProjects(token) {
  if (_dataCache) return _dataCache

  const res = await fetch(DATA_ENDPOINT, {
    headers: {
      AccessKey: ACCESS_KEY,
      Token: token,
    },
  })

  if (!res.ok) {
    throw new Error(`URA data fetch failed (HTTP ${res.status}).`)
  }

  const json = await res.json()

  if (json.Status !== 'Success') {
    throw new Error(`URA data error: ${json.Message ?? 'Unknown error'}`)
  }

  _dataCache = json.Result   // array of project objects
  return _dataCache
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches URA private residential rental median data for the given
 * planning area and room type, returning an object with:
 *   { medianPsf, estimatedRent, psf25, psf75, refPeriod,
 *     projectCount, bedroomLabel, sqft, districts }
 *
 * Returns null if no data is available for the selected area.
 * Throws an Error with a human-readable message on failure.
 */
export async function fetchUraRentalMedian(town, roomLabel) {
  if (!ACCESS_KEY || ACCESS_KEY === 'your_ura_access_key_here') {
    throw new Error(
      'URA access key not set. Add your key to .env as REACT_APP_URA_ACCESS_KEY.'
    )
  }

  const districts = AREA_TO_DISTRICTS[town]
  if (!districts) throw new Error(`No district mapping found for: ${town}`)

  const token    = await getToken()
  const projects = await fetchAllProjects(token)

  // Collect PSF values per refPeriod for the selected district(s)
  // district in the API is a 2-digit zero-padded string, e.g. "03", "20"
  const byPeriod = {}

  for (const project of projects) {
    if (!Array.isArray(project.rentalMedian)) continue

    for (const entry of project.rentalMedian) {
      const district = String(entry.district).padStart(2, '0')
      if (!districts.includes(district)) continue

      const psf = parseFloat(entry.median)
      if (!Number.isFinite(psf) || psf <= 0) continue

      if (!byPeriod[entry.refPeriod]) byPeriod[entry.refPeriod] = []
      byPeriod[entry.refPeriod].push({
        psf,
        psf25: parseFloat(entry.psf25),
        psf75: parseFloat(entry.psf75),
      })
    }
  }

  const periods = Object.keys(byPeriod)
  if (periods.length === 0) return null

  const latest  = latestRefPeriod(periods)
  const entries = byPeriod[latest]

  const psfValues  = entries.map(e => e.psf).sort((a, b) => a - b)
  const psf25Values = entries.map(e => e.psf25).filter(Number.isFinite)
  const psf75Values = entries.map(e => e.psf75).filter(Number.isFinite)

  const medianPsf = medianOf(psfValues)
  const { sqft, label: bedroomLabel } = ROOM_TO_CONDO[roomLabel]

  // Round estimated rent to nearest $50 for a cleaner display
  const round50 = n => Math.round(n / 50) * 50

  return {
    medianPsf:     Math.round(medianPsf * 100) / 100,
    estimatedRent: round50(medianPsf * sqft),
    rentLow:       round50(medianOf(psf25Values.sort((a, b) => a - b)) * sqft),
    rentHigh:      round50(medianOf(psf75Values.sort((a, b) => a - b)) * sqft),
    refPeriod:     formatRefPeriod(latest),
    projectCount:  psfValues.length,
    bedroomLabel,
    sqft,
    districts,
  }
}
