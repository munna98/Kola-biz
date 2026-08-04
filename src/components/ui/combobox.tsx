import * as React from "react"
import { ChevronsUpDown, Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxOption {
  value: string | number
  label: string
  searchString?: string
  subLabel?: string
  keywords?: string[]
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string | number
  onChange: (value: string | number) => void
  onCreate?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
  openOnFocus?: boolean
  onEmptyEnter?: () => void
  onActionClick?: () => void
  /** Called synchronously inside onCloseAutoFocus right after an item is selected.
   *  Use this to redirect focus before the browser moves it anywhere else. */
  onAfterSelect?: () => void
  filter?: (value: string, search: string, keywords?: string[]) => number
}

const defaultComboboxFilter = (value: string, search: string, keywords?: string[]) => {
  const searchTrim = search.trim().toLowerCase();
  if (!searchTrim) return 1;

  // 1. Exact match on explicit keywords (e.g. barcode "130" or item code "130")
  if (keywords && keywords.length > 0) {
    for (const kw of keywords) {
      if (!kw) continue;
      const kwLower = String(kw).trim().toLowerCase();
      if (kwLower === searchTrim) {
        return 1000; // Top priority for exact barcode/code match!
      }
    }
  }

  const valueLower = value.toLowerCase();
  const valueTokens = valueLower.split(/[\s\-:\/\\]+/).filter(Boolean);

  // 2. Exact match on individual tokens in value (e.g. code/barcode embedded in searchString)
  for (const token of valueTokens) {
    if (token === searchTrim) {
      return 900;
    }
  }

  // 3. Prefix match on explicit keywords (e.g. barcode "1300" when typing "130")
  if (keywords && keywords.length > 0) {
    let bestKwScore = 0;
    for (const kw of keywords) {
      if (!kw) continue;
      const kwLower = String(kw).trim().toLowerCase();
      if (kwLower.startsWith(searchTrim)) {
        const lenDiff = kwLower.length - searchTrim.length;
        const score = Math.max(100, 500 - lenDiff * 10);
        if (score > bestKwScore) bestKwScore = score;
      }
    }
    if (bestKwScore > 0) return bestKwScore;
  }

  // 4. Prefix match on value tokens
  for (const token of valueTokens) {
    if (token.startsWith(searchTrim)) {
      const lenDiff = token.length - searchTrim.length;
      return Math.max(50, 400 - lenDiff * 10);
    }
  }

  // 5. Substring match on full value
  if (valueLower.includes(searchTrim)) {
    return 10;
  }

  return 0;
};

export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps & { disabled?: boolean }>(({
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  onKeyDown,
  openOnFocus = true,
  onActionClick,
  onEmptyEnter,
  onAfterSelect,
  filter,
}, ref) => {
  const [open, setOpen] = React.useState(false)
  const [hasOpenedOnFocus, setHasOpenedOnFocus] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const skipOpen = React.useRef(false)
  const itemSelected = React.useRef(false)
  const isPointerDown = React.useRef(false)
  const autoSelectTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleFocus = React.useCallback(() => {
    if (skipOpen.current || isPointerDown.current) {
      return
    }
    if (openOnFocus && !open && !hasOpenedOnFocus) {
      setOpen(true);
      setHasOpenedOnFocus(true);
    }
  }, [openOnFocus, open, hasOpenedOnFocus]);

  // Reset flag when closed so it can open again on next focus cycle
  React.useEffect(() => {
    if (!open) {
      setHasOpenedOnFocus(false);
      setInputValue("");
    }
  }, [open]);

  // Auto-select when the typed/scanned value is an exact keyword match for exactly one option.
  // This handles barcode scanning: "101" should immediately pick "101 - AMPLIFIER WIRING KIT"
  // even if "1010 - T SHIRT" also appears in the list.
  React.useEffect(() => {
    if (autoSelectTimer.current) {
      clearTimeout(autoSelectTimer.current);
      autoSelectTimer.current = null;
    }

    if (!open || !inputValue.trim()) return;

    const searchTrim = inputValue.trim().toLowerCase();
    const activeFilter = filter || defaultComboboxFilter;

    // Find all options that score as an "exact" match (≥ 900 = exact keyword or exact token)
    const exactMatches = options.filter((opt) => {
      const searchStr = opt.searchString || String(opt.label);
      const score = activeFilter(searchStr, searchTrim, opt.keywords);
      return score >= 900;
    });

    if (exactMatches.length === 1) {
      // Delay slightly so the user can see what was matched (feels less jarring than instant)
      autoSelectTimer.current = setTimeout(() => {
        if (itemSelected.current) return; // already selected by click
        itemSelected.current = true;
        onChange(exactMatches[0].value);
        setOpen(false);
        skipOpen.current = true;
        setTimeout(() => { skipOpen.current = false; }, 80);
        onAfterSelect?.();
      }, 120);
    }

    return () => {
      if (autoSelectTimer.current) {
        clearTimeout(autoSelectTimer.current);
        autoSelectTimer.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, open]);

  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between h-8 text-sm w-full font-normal group", className)}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onFocus={handleFocus}
          onPointerDown={() => { isPointerDown.current = true }}
          onPointerUp={() => { setTimeout(() => { isPointerDown.current = false }, 300) }}
        >
          <span className="truncate text-left flex-1">
            {selectedOption?.label || placeholder}
          </span>
          <div className="flex items-center gap-1">
            {onActionClick && (
              <div
                role="button"
                className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted text-muted-foreground hover:text-primary z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onActionClick();
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Plus size={14} />
              </div>
            )}
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)]"
        align="start"
        onOpenAutoFocus={() => {
          // Allow auto-focusing the input
        }}
        onCloseAutoFocus={(e) => {
          if (itemSelected.current) {
            // If onAfterSelect is provided, let Radix restore focus to the trigger
            // naturally (trigger has skipOpen=true so it won't reopen). onAfterSelect
            // will then redirect focus via RAF after all Radix cleanup is done.
            // Without onAfterSelect, prevent return-to-trigger as normal.
            if (!onAfterSelect) {
              e.preventDefault();
            }
            itemSelected.current = false;
            onAfterSelect?.();
          }
        }}
      >
        <Command filter={filter || defaultComboboxFilter}>
          <CommandInput
            placeholder={searchPlaceholder}
            autoFocus
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {onCreate && inputValue ? (
                <div className="p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-left font-normal"
                    onClick={() => {
                      itemSelected.current = true;
                      onCreate(inputValue);
                      setOpen(false);
                      skipOpen.current = true;
                      setTimeout(() => {
                        skipOpen.current = false;
                      }, 80);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create "{inputValue}"
                  </Button>
                </div>
              ) : (
                "No results found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {/* Hidden item for 'Enter to Skip' behavior */}
              {onEmptyEnter && !inputValue && (
                <CommandItem
                  value=":::SKIP:::"
                  className="h-0 p-0 min-h-0 overflow-hidden opacity-0 data-[selected='true']:bg-transparent"
                  onSelect={() => {
                    setOpen(false);
                    onEmptyEnter();
                  }}
                >
                  <span className="hidden">Skip</span>
                </CommandItem>
              )}

              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // cmdk uses the 'value' prop for internal filtering. 
                  // It should ideally be the label string.
                  value={option.searchString || String(option.label)}
                  keywords={option.keywords}
                  onSelect={() => {
                    itemSelected.current = true;
                    onChange(option.value)
                    setOpen(false)
                    skipOpen.current = true
                    setTimeout(() => {
                      skipOpen.current = false
                    }, 80)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.subLabel && (
                    <span className="ml-3 text-xs text-muted-foreground font-normal truncate max-w-[40%]">{option.subLabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
})
Combobox.displayName = "Combobox"