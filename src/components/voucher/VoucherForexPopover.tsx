import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Combobox } from '@/components/ui/combobox';
import { useCurrencyLabel } from '@/hooks/useMoney';

export interface CurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string;
  is_base: number;
  exchange_rate: number;
}

interface VoucherForexPopoverProps {
  currencyId: string | null;
  exchangeRate: number;
  foreignCurrencyCode: string;
  foreignCurrencySymbol: string;
  isMultiCurrencyEnabled: boolean;
  isReadOnly?: boolean;
  onCurrencyChange: (info: { id: string; code: string; symbol: string; rate: number } | null) => void;
  onExchangeRateChange: (rate: number) => void;
}

export function VoucherForexPopover({
  currencyId,
  exchangeRate,
  foreignCurrencyCode,
  isMultiCurrencyEnabled,
  isReadOnly = false,
  onCurrencyChange,
  onExchangeRateChange,
}: VoucherForexPopoverProps) {
  const baseCurrencyLabel = useCurrencyLabel() || 'INR';
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);

  useEffect(() => {
    if (!isMultiCurrencyEnabled) return;
    invoke<CurrencyItem[]>('get_currencies')
      .then((list) => {
        setCurrencies(list.filter((c) => c.is_base !== 1));
      })
      .catch(console.error);
  }, [isMultiCurrencyEnabled]);

  if (!isMultiCurrencyEnabled) return null;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={currencyId ? 'default' : 'outline'}
            size="sm"
            disabled={isReadOnly}
            className={`h-8 px-2.5 flex items-center gap-1 text-xs font-medium rounded-md transition-all ${
              currencyId
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                : 'border-dashed border-muted-foreground/40 hover:border-primary/50'
            }`}
          >
            {currencyId ? (
              <>
                <span className="font-bold">{foreignCurrencyCode}</span>
                <span className="text-[10px] opacity-80">@ {exchangeRate}</span>
              </>
            ) : (
              <span className="text-muted-foreground text-[11px]">+ Currency</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-3" align="end">
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="font-semibold text-xs text-foreground">Multi-Currency Settings</h4>
            {currencyId && !isReadOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onCurrencyChange(null)}
              >
                Reset to Base ({baseCurrencyLabel})
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Select Foreign Currency</label>
            <Combobox
              options={currencies.map((c) => ({
                value: c.id,
                label: `${c.code} (${c.symbol}) - ${c.name}`,
              }))}
              value={currencyId || undefined}
              onChange={(val) => {
                const selected = currencies.find((c) => c.id === val);
                if (selected) {
                  onCurrencyChange({
                    id: selected.id,
                    code: selected.code,
                    symbol: selected.symbol,
                    rate: selected.exchange_rate > 0 ? selected.exchange_rate : 1.0,
                  });
                } else {
                  onCurrencyChange(null);
                }
              }}
              placeholder="Select currency..."
              disabled={isReadOnly}
            />
          </div>

          {currencyId && (
            <div className="space-y-1.5 pt-1 border-t">
              <label className="text-[11px] font-medium text-muted-foreground block">
                Exchange Rate (1 {foreignCurrencyCode} = ? {baseCurrencyLabel})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold shrink-0">1 {foreignCurrencyCode} =</span>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={exchangeRate || 1.0}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    if (!isNaN(parsed) && parsed > 0) {
                      onExchangeRateChange(parsed);
                    }
                  }}
                  disabled={isReadOnly}
                  className="h-8 text-xs font-mono"
                />
                <span className="text-xs text-muted-foreground shrink-0">{baseCurrencyLabel}</span>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
