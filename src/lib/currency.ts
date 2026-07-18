import type { CompanyProfileState } from '@/store';

export type CurrencyDisplay = 'symbol' | 'code' | 'none';

export interface CurrencyFormatOptions {
  currencyCode?: string | null;
  currencySymbol?: string | null;
  currencyDisplay?: CurrencyDisplay | string | null;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
}

export function formatMoney(amount: number | null | undefined, options: CurrencyFormatOptions = {}) {
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const locale = options.locale || 'en-IN';
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  const display = options.currencyDisplay || 'symbol';
  const code = options.currencyCode || 'INR';
  const symbol = options.currencySymbol || '₹';

  if (display === 'code') {
    return `${code} ${formatted}`;
  }

  if (display === 'none') {
    return formatted;
  }

  return `${symbol}${formatted}`;
}

export function formatCompanyMoney(
  amount: number | null | undefined,
  profile: CompanyProfileState['profile'],
  options: Omit<CurrencyFormatOptions, 'currencyCode' | 'currencySymbol' | 'currencyDisplay'> = {}
) {
  return formatMoney(amount, {
    ...options,
    currencyCode: profile.base_currency,
    currencySymbol: profile.base_currency_symbol,
    currencyDisplay: profile.currency_display,
  });
}
