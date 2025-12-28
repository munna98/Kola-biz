import * as React from "react"
import { ChevronsUpDown, Check } from "lucide-react"
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
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string | number
  onChange: (value: string | number) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
  openOnFocus?: boolean
}

export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps & { disabled?: boolean }>(({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  onKeyDown,
  openOnFocus = true,
}, ref) => {
  const [open, setOpen] = React.useState(false)
  const [hasOpenedOnFocus, setHasOpenedOnFocus] = React.useState(false)
  const skipOpen = React.useRef(false)
  const isPointerDown = React.useRef(false)

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
    }
  }, [open]);

  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between h-8 text-sm w-full font-normal", className)}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onFocus={handleFocus}
          onPointerDown={() => { isPointerDown.current = true }}
          onPointerUp={() => { setTimeout(() => { isPointerDown.current = false }, 300) }}
        >
          <span className="truncate text-left">
            {selectedOption?.label || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)]"
        align="start"
        onOpenAutoFocus={() => {
          // Allow auto-focusing the input
        }}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} autoFocus />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  // cmdk uses the 'value' prop for internal filtering. 
                  // It should ideally be the label string.
                  value={String(option.label)}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                    skipOpen.current = true
                    setTimeout(() => {
                      skipOpen.current = false
                    }, 300)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
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