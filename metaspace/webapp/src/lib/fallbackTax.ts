// Fallback tax rates for when backend tax calculation is disabled
// These are standard VAT rates as of 2024 - should be updated periodically

export interface FallbackTaxRate {
  country: string
  standardRate: number // as decimal (e.g., 0.19 for 19%)
  description: string
}

// Standard VAT rates for EU and other countries
export const FALLBACK_TAX_RATES: Record<string, FallbackTaxRate> = {
  // EU Countries
  AT: { country: 'Austria', standardRate: 0.2, description: '20% VAT' },
  BE: { country: 'Belgium', standardRate: 0.21, description: '21% VAT' },
  BG: { country: 'Bulgaria', standardRate: 0.2, description: '20% VAT' },
  HR: { country: 'Croatia', standardRate: 0.25, description: '25% VAT' },
  CY: { country: 'Cyprus', standardRate: 0.19, description: '19% VAT' },
  CZ: { country: 'Czech Republic', standardRate: 0.21, description: '21% VAT' },
  DK: { country: 'Denmark', standardRate: 0.25, description: '25% VAT' },
  EE: { country: 'Estonia', standardRate: 0.2, description: '20% VAT' },
  FI: { country: 'Finland', standardRate: 0.24, description: '24% VAT' },
  FR: { country: 'France', standardRate: 0.2, description: '20% VAT' },
  DE: { country: 'Germany', standardRate: 0.19, description: '19% VAT' },
  GR: { country: 'Greece', standardRate: 0.24, description: '24% VAT' },
  HU: { country: 'Hungary', standardRate: 0.27, description: '27% VAT' },
  IE: { country: 'Ireland', standardRate: 0.23, description: '23% VAT' },
  IT: { country: 'Italy', standardRate: 0.22, description: '22% VAT' },
  LV: { country: 'Latvia', standardRate: 0.21, description: '21% VAT' },
  LT: { country: 'Lithuania', standardRate: 0.21, description: '21% VAT' },
  LU: { country: 'Luxembourg', standardRate: 0.17, description: '17% VAT' },
  MT: { country: 'Malta', standardRate: 0.18, description: '18% VAT' },
  NL: { country: 'Netherlands', standardRate: 0.21, description: '21% VAT' },
  PL: { country: 'Poland', standardRate: 0.23, description: '23% VAT' },
  PT: { country: 'Portugal', standardRate: 0.23, description: '23% VAT' },
  RO: { country: 'Romania', standardRate: 0.19, description: '19% VAT' },
  SK: { country: 'Slovakia', standardRate: 0.2, description: '20% VAT' },
  SI: { country: 'Slovenia', standardRate: 0.22, description: '22% VAT' },
  ES: { country: 'Spain', standardRate: 0.21, description: '21% VAT' },
  SE: { country: 'Sweden', standardRate: 0.25, description: '25% VAT' },

  // Other European countries
  GB: { country: 'United Kingdom', standardRate: 0.2, description: '20% VAT' },
  NO: { country: 'Norway', standardRate: 0.25, description: '25% VAT' },
  CH: { country: 'Switzerland', standardRate: 0.077, description: '7.7% VAT' },

  // Other major markets
  CA: { country: 'Canada', standardRate: 0.05, description: '5% GST' }, // Federal GST only, provinces may add PST
  AU: { country: 'Australia', standardRate: 0.1, description: '10% GST' },
  NZ: { country: 'New Zealand', standardRate: 0.15, description: '15% GST' },
  JP: { country: 'Japan', standardRate: 0.1, description: '10% Consumption Tax' },
  KR: { country: 'South Korea', standardRate: 0.1, description: '10% VAT' },
  SG: { country: 'Singapore', standardRate: 0.08, description: '8% GST' },

  // Note: US does not have federal VAT, sales tax varies by state
  // 'US': No standard rate - varies by state and locality
}

export interface FallbackVatCalculation {
  priceExclusiveVAT: number
  vatAmount: number
  priceInclusiveVAT: number
  taxRate: number
  calculationMethod: string
  isFallback: true
}

/**
 * Calculate fallback VAT for a given country and price
 * @param countryCode - ISO 2-letter country code
 * @param priceCents - Price in cents (exclusive of VAT)
 * @returns Fallback VAT calculation or null if no rate available
 */
export function calculateFallbackVat(countryCode: string, priceCents: number): FallbackVatCalculation | null {
  const taxRate = FALLBACK_TAX_RATES[countryCode]

  if (!taxRate) {
    return null
  }

  const priceExclusiveVAT = priceCents
  const vatAmount = Math.round(priceCents * taxRate.standardRate)
  const priceInclusiveVAT = priceExclusiveVAT + vatAmount

  return {
    priceExclusiveVAT,
    vatAmount,
    priceInclusiveVAT,
    taxRate: taxRate.standardRate,
    calculationMethod: `Fallback ${taxRate.description}`,
    isFallback: true,
  }
}

/**
 * Check if a country has fallback tax rates available
 * @param countryCode - ISO 2-letter country code
 * @returns boolean indicating if fallback rates are available
 */
export function hasFallbackTaxRate(countryCode: string): boolean {
  return countryCode in FALLBACK_TAX_RATES
}

/**
 * Get the tax rate description for a country
 * @param countryCode - ISO 2-letter country code
 * @returns Tax rate description or null if not available
 */
export function getFallbackTaxDescription(countryCode: string): string | null {
  const taxRate = FALLBACK_TAX_RATES[countryCode]
  return taxRate ? taxRate.description : null
}
