import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MapPin, RotateCcw } from 'lucide-react';
import { IconRepeat } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

export interface ShipToAddress {
    name: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    gstin?: string;
}

interface ShipToPopoverProps {
    shipTo: ShipToAddress | undefined;
    onChange: (shipTo: ShipToAddress | undefined) => void;
    defaultAddress: ShipToAddress | undefined;
    disabled?: boolean;
    partyId?: string | number;
}

export function ShipToPopover({ shipTo, onChange, defaultAddress, disabled, partyId }: ShipToPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [localState, setLocalState] = useState<ShipToAddress>(
        shipTo || defaultAddress || { name: '' }
    );
    const [recentAddresses, setRecentAddresses] = useState<ShipToAddress[]>([]);

    // Sync local state when shipTo changes from parent
    useEffect(() => {
        if (shipTo) {
            setLocalState(shipTo);
        } else if (defaultAddress) {
            setLocalState(defaultAddress);
        }
    }, [shipTo, defaultAddress]);

    // Load recent shipping addresses for this party when popover opens
    useEffect(() => {
        if (partyId && isOpen) {
            invoke<ShipToAddress[]>('get_recent_ship_to_addresses', { partyId: String(partyId) })
                .then((res) => setRecentAddresses(res || []))
                .catch((err) => console.error('Failed to load recent ship to addresses', err));
        }
    }, [partyId, isOpen]);

    const handleApply = () => {
        onChange(localState);
        setIsOpen(false);
    };

    const handleReset = () => {
        const resetAddress = defaultAddress || { name: '' };
        setLocalState(resetAddress);
        onChange(undefined);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent, nextId?: string, isLast?: boolean) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isLast) {
                if (localState.name) {
                    handleApply();
                }
            } else if (nextId) {
                const nextElement = document.getElementById(nextId);
                if (nextElement) {
                    nextElement.focus();
                }
            }
        }
    };

    const hasCustomAddress = shipTo !== undefined;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                variant={hasCustomAddress ? "default" : "outline"}
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={disabled}
                            >
                                <MapPin className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                        {hasCustomAddress ? "Edit Ship To Address" : "Add Ship To Address"}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <PopoverContent className="w-80 p-3.5" align="end">
                <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="font-semibold text-xs text-foreground leading-none">Ship To Address</h4>
                        <div className="flex items-center gap-1">
                            {recentAddresses.length > 0 && (
                                recentAddresses.length === 1 ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            setLocalState(recentAddresses[0]);
                                            toast.success("Reused previous shipping address");
                                        }}
                                        title={`Reuse previous address (${recentAddresses[0].name || ''})`}
                                    >
                                        <IconRepeat size={14} />
                                    </Button>
                                ) : (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                                title="Reuse previous shipping address"
                                            >
                                                <IconRepeat size={14} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">
                                                Previous Addresses ({recentAddresses.length})
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {recentAddresses.map((addr, idx) => (
                                                <DropdownMenuItem
                                                    key={idx}
                                                    className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5"
                                                    onClick={() => {
                                                        setLocalState(addr);
                                                        toast.success(`Loaded address: ${addr.name || 'Ship To'}`);
                                                    }}
                                                >
                                                    <span className="font-medium text-xs truncate max-w-[200px]">{addr.name || 'Unnamed'}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                                        {[addr.address_line_1, addr.city, addr.state].filter(Boolean).join(', ')}
                                                    </span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )
                            )}
                            {hasCustomAddress && (
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={handleReset} title="Reset to Billing Address">
                                    <RotateCcw className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    </div>
                    
                    <div className="grid gap-2.5">
                        <div className="grid gap-1">
                            <Label htmlFor="ship-to-name" className="text-xs font-medium text-muted-foreground">Name / Company *</Label>
                            <Input
                                id="ship-to-name"
                                value={localState.name || ''}
                                onChange={(e) => setLocalState(prev => ({ ...prev, name: e.target.value }))}
                                onKeyDown={(e) => handleKeyDown(e, 'ship-to-address1')}
                                placeholder="Recipient Name"
                                className="h-8 text-xs px-2.5"
                                autoFocus
                            />
                        </div>
                        <div className="grid gap-1">
                            <Label htmlFor="ship-to-address1" className="text-xs font-medium text-muted-foreground">Address Line 1</Label>
                            <Input
                                id="ship-to-address1"
                                value={localState.address_line_1 || ''}
                                onChange={(e) => setLocalState(prev => ({ ...prev, address_line_1: e.target.value }))}
                                onKeyDown={(e) => handleKeyDown(e, 'ship-to-address2')}
                                placeholder="Street, Area"
                                className="h-8 text-xs px-2.5"
                            />
                        </div>
                        <div className="grid gap-1">
                            <Label htmlFor="ship-to-address2" className="text-xs font-medium text-muted-foreground">Address Line 2</Label>
                            <Input
                                id="ship-to-address2"
                                value={localState.address_line_2 || ''}
                                onChange={(e) => setLocalState(prev => ({ ...prev, address_line_2: e.target.value }))}
                                onKeyDown={(e) => handleKeyDown(e, 'ship-to-city')}
                                placeholder="Building, Floor"
                                className="h-8 text-xs px-2.5"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                                <Label htmlFor="ship-to-city" className="text-xs font-medium text-muted-foreground">City</Label>
                                <Input
                                    id="ship-to-city"
                                    value={localState.city || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, city: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'ship-to-state')}
                                    placeholder="City"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="ship-to-state" className="text-xs font-medium text-muted-foreground">State</Label>
                                <Input
                                    id="ship-to-state"
                                    value={localState.state || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, state: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'ship-to-pin')}
                                    placeholder="State"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                                <Label htmlFor="ship-to-pin" className="text-xs font-medium text-muted-foreground">PIN Code</Label>
                                <Input
                                    id="ship-to-pin"
                                    value={localState.postal_code || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, postal_code: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'ship-to-gstin')}
                                    placeholder="PIN"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="ship-to-gstin" className="text-xs font-medium text-muted-foreground">GSTIN</Label>
                                <Input
                                    id="ship-to-gstin"
                                    value={localState.gstin || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, gstin: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, undefined, true)}
                                    placeholder="Optional"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-1">
                        <Button id="ship-to-apply-btn" size="sm" className="w-full h-8 text-xs font-medium" onClick={handleApply} disabled={!localState.name}>
                            Apply Address
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
