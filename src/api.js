// HDB Rental Transactions — Renting Out of Flats from Jan 2021
// data.gov.sg dataset: d_c9f57187485a850908655db0e8cfe651
// (The originally referenced dataset d_ea9ed51da2787afaf8e51f58ec0cee75 is not publicly accessible;
//  this is the correct live HDB rental transactions dataset.)

const CKAN_BASE = 'https://data.gov.sg/api/action/datastore_search'
const DATASET_ID = 'd_c9f57187485a850908655db0e8cfe651'

// Maps UI room labels → API flat_type values
export const FLAT_TYPE_MAP = {
  '1-Room': '1-ROOM',
  '2-Room': '2-ROOM',
  '3-Room': '3-ROOM',
  '4-Room': '4-ROOM',
  '5-Room': '5-ROOM',
}

// Simple in-memory cache: cacheKey → result
const cache = new Map()

function median(sorted) {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

// Nearest-rank percentile on an ascending-sorted array.
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Fetch with automatic retry on 429, using exponential backoff.
async function fetchWithRetry(url, maxAttempts = 4) {
  let delay = 800 // ms — initial wait before first retry
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url)

    if (res.status === 429) {
      if (attempt === maxAttempts) {
        throw new Error('The data.gov.sg API is rate-limiting requests. Please wait a moment and try again.')
      }
      await sleep(delay)
      delay *= 2 // 800 ms → 1.6 s → 3.2 s
      continue
    }

    if (!res.ok) throw new Error(`API error (${res.status}). Please try again.`)
    return res
  }
}

/**
 * Fetches HDB rental records for a given town and flat type,
 * then returns { median, min, max, count, fromMonth, toMonth }.
 * Returns null if no records are found.
 * Results are cached in memory for the lifetime of the page.
 */
export async function fetchHdbRentals(town, roomLabel) {
  const flatType = FLAT_TYPE_MAP[roomLabel]
  if (!flatType) throw new Error(`Unknown room label: ${roomLabel}`)

  const cacheKey = `${town}|${flatType}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const filters = JSON.stringify({
    town: town.toUpperCase(),
    flat_type: flatType,
  })

  const url =
    `${CKAN_BASE}` +
    `?resource_id=${DATASET_ID}` +
    `&filters=${encodeURIComponent(filters)}` +
    `&sort=rent_approval_date+desc` +
    `&limit=2000`

  const res = await fetchWithRetry(url)
  const json = await res.json()
  if (!json.success) throw new Error('API returned an error. Please try again.')

  const records = json.result.records
  if (records.length === 0) {
    cache.set(cacheKey, null)
    return null
  }

  const rents = records
    .map(r => Number(r.monthly_rent))
    .filter(n => !isNaN(n) && n > 0)
    .sort((a, b) => a - b)

  if (rents.length === 0) {
    cache.set(cacheKey, null)
    return null
  }

  const dates = records
    .map(r => r.rent_approval_date)
    .filter(Boolean)
    .sort()

  const result = {
    median: median(rents),
    p25: percentile(rents, 25),
    p75: percentile(rents, 75),
    min: rents[0],
    max: rents[rents.length - 1],
    count: rents.length,
    fromMonth: dates[0] ?? null,
    toMonth: dates[dates.length - 1] ?? null,
  }

  cache.set(cacheKey, result)
  return result
}
