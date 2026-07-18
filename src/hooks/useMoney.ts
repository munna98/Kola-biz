import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { formatCompanyMoney, formatMoney, type CurrencyFormatOptions } from '@/lib/currency';

type MoneyOptions = Omit<CurrencyFormatOptions, 'currencyCode' | 'currencySymbol' | 'currencyDisplay'>;

export function useMoney() {
  const profile = useSelector((state: RootState) => state.companyProfile.profile);

  return useCallback(
    (amount: number | null | undefined, options: MoneyOptions = {}) =>
      formatCompanyMoney(amount, profile, options),
    [
      profile.base_currency,
      profile.base_currency_symbol,
      profile.currency_display,
    ]
  );
}

export function useCurrencyLabel() {
  const profile = useSelector((state: RootState) => state.companyProfile.profile);

  if (profile.currency_display === 'none') {
    return '';
  }

  if (profile.currency_display === 'code') {
    return profile.base_currency || 'INR';
  }

  return profile.base_currency_symbol || '₹';
}

/**
 * Returns a money formatter for a specific foreign currency (e.g., USD).
 * Used on invoice/receipt forms when a foreign customer is selected.
 */
export function useForexMoney(currencyCode: string, currencySymbol: string) {
  const profile = useSelector((state: RootState) => state.companyProfile.profile);
  return useCallback(
    (amount: number | null | undefined, options: MoneyOptions = {}) =>
      formatMoney(amount, {
        ...options,
        currencyCode: currencyCode || profile.base_currency,
        currencySymbol: currencySymbol || profile.base_currency_symbol,
        currencyDisplay: currencyCode ? 'symbol' : profile.currency_display,
      }),
    [currencyCode, currencySymbol, profile.base_currency, profile.base_currency_symbol, profile.currency_display]
  );
}
