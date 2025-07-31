import { PricingOption } from '../api/plan'

/**
 * Format price from cents to dollars with 2 decimal places
 */
export const formatPrice = (priceCents: number | undefined): string => {
  if (priceCents === undefined) return '0.00'
  return (priceCents / 100).toFixed(2)
}

/**
 * Get pricing option for a specific period from a plan
 */
export const getPricingOptionForPeriod = (plan: any, period: PricingOption): any => {
  return plan.pricingOptions?.find(
    (po: any) => po.isActive && po.displayName.toLowerCase() === period.displayName.toLowerCase()
  )
}

/**
 * Get total price for a specific period from a plan
 */
export const getPriceForPeriod = (plan: any, period: PricingOption): number => {
  const option = getPricingOptionForPeriod(plan, period)
  return option ? option.priceCents : 0
}

/**
 * Calculate monthly price from total price and period months
 */
export const getMonthlyPrice = (plan: any, period: PricingOption): number => {
  const totalPrice = getPriceForPeriod(plan, period)
  if (totalPrice === 0) return 0

  const months = period.periodMonths || 1
  return totalPrice / months
}

/**
 * Calculate monthly price from price in cents and period months
 */
export const getMonthlyPriceFromCents = (priceCents: number, periodMonths: number): number => {
  return priceCents / periodMonths
}

/**
 * Calculate savings percentage compared to monthly pricing
 */
export const getSavingsPercentage = (plan: any, currentPeriod: PricingOption): number | null => {
  const monthlyOption = plan.pricingOptions?.find(
    (po: any) => po.isActive && po.displayName.toLowerCase() === 'monthly'
  )
  if (!monthlyOption) return null

  const currentMonthlyPrice = getMonthlyPrice(plan, currentPeriod)
  if (currentMonthlyPrice === 0 || currentPeriod.displayName.toLowerCase() === 'monthly') return null

  const savings = ((monthlyOption.priceCents - currentMonthlyPrice) / monthlyOption.priceCents) * 100
  return Math.round(savings)
}

/**
 * Calculate savings percentage from monthly prices
 */
export const getSavingsPercentageFromPrices = (monthlyPrice: number, baseMonthlyPrice: number): number => {
  if (monthlyPrice === 0 || baseMonthlyPrice === 0) return 0
  const savings = ((baseMonthlyPrice - monthlyPrice) / baseMonthlyPrice) * 100
  return Math.max(0, Number(savings.toFixed(1)))
}

/**
 * Get billing interval string from period months
 */
export const getBillingInterval = (pricingOption: any): string => {
  if (!pricingOption) return 'monthly'

  const monthsMap: Record<number, string> = {
    1: 'monthly',
    12: 'yearly',
    24: 'yearly', // 2 years is still yearly billing interval
  }
  return monthsMap[pricingOption.periodMonths] || 'monthly'
}

/**
 * Get period display name
 */
export const getPeriodDisplayName = (period: PricingOption): string => {
  return period.displayName
}

/**
 * Get all unique active periods from plans
 */
export const getAvailablePeriods = (plans: any[]): PricingOption[] => {
  const periodMap = new Map<string, PricingOption>()
  plans.forEach((plan) => {
    plan.pricingOptions?.forEach((option: any) => {
      if (option.isActive) {
        const key = option.displayName.toLowerCase()
        // Use the first occurrence of each period type, or the one with lower displayOrder
        if (!periodMap.has(key) || option.displayOrder < periodMap.get(key)!.displayOrder) {
          periodMap.set(key, option)
        }
      }
    })
  })

  const periods = Array.from(periodMap.values()).sort((a, b) => a.displayOrder - b.displayOrder)
  return periods
}
