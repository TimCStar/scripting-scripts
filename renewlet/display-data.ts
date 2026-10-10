import { fetch } from 'scripting'
import { type Config } from './model'
import { RenewletClient, type Credential, type Fetcher } from './client'
import {
  categories,
  categoryLabel,
  parseCategories,
  parseRates,
  type Rates,
} from './presentation'

const FX = 'renewlet.fx.v1',
  CATEGORY = 'renewlet.categories.v1',
  TTL = 86400000
let pendingRates: Promise<void> | null = null,
  generation = 0
const pendingCategories = new Map<string, Promise<void>>()
// Explicitly fictional rates, used only by the labelled offline demo.
const demoRates: Rates = {
  date: '2026-10-10',
  usd: { usd: 1, cny: 7, gbp: 0.75, try: 40, eur: 0.9 },
}
export function readRates(c: Config): Rates | null {
  if (c.mode === 'demo') return demoRates
  return parseRates(Storage.get<{ rates?: unknown }>(FX)?.rates)
}
export function customCategories(c: Config): Record<string, string> {
  const cached = Storage.get<{ revision: string; values: unknown }>(CATEGORY)
  return cached?.revision === c.revision ? parseCategories(cached.values) : {}
}
export function displayCategory(c: Config, value: string) {
  return categoryLabel(value, customCategories(c))
}
export function categoryOptions(c: Config, current: string) {
  const labels: Record<string, string> = Object.assign(
    Object.create(null),
    categories,
    customCategories(c),
  )
  if (!Object.hasOwn(labels, current)) labels[current] = current
  return Object.entries(labels)
}
export function clearCategories() {
  generation++
  Storage.remove(CATEGORY)
}
async function loadRates(c: Config) {
  if (c.mode === 'demo') return
  const cached = Storage.get<{ time: number }>(FX)
  if (readRates(c) && cached && Date.now() - cached.time < TTL) return
  if (pendingRates) return pendingRates
  pendingRates = (async () => {
    for (const url of [
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
      'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
    ]) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {},
          timeout: 4,
          handleRedirect: async () => null,
        })
        if (!response.ok || (response.expectedContentLength ?? 0) > 262144)
          continue
        const rates = parseRates(await response.json())
        if (rates) {
          Storage.set(FX, { time: Date.now(), rates })
          return
        }
      } catch {
        /* Retain the last successful dated rates offline. */
      }
    }
  })()
  try {
    await pendingRates
  } finally {
    pendingRates = null
  }
}
async function loadCategories(c: Config, auth: Credential | null) {
  if (c.mode !== 'session') return
  const cached = Storage.get<{ revision: string; time: number }>(CATEGORY)
  if (cached?.revision === c.revision && Date.now() - cached.time < TTL) return
  if (pendingCategories.has(c.revision))
    return pendingCategories.get(c.revision)
  const start = generation
  const job = (async () => {
    try {
      const values = await new RenewletClient(
        c.baseURL,
        auth,
        fetch as Fetcher,
      ).categories()
      if (start === generation)
        Storage.set(CATEGORY, {
          revision: c.revision,
          time: Date.now(),
          values,
        })
    } catch {
      /* Built-in Chinese labels remain available. */
    }
  })()
  pendingCategories.set(c.revision, job)
  try {
    await job
  } finally {
    pendingCategories.delete(c.revision)
  }
}
export async function prepareDisplayData(c: Config, auth: Credential | null) {
  await Promise.all([loadRates(c), loadCategories(c, auth)])
}
