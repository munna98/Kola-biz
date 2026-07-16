import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MapPin, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';

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
}

export function ShipToPopover({ shipTo, onChange, defaultAddress, disabled }: ShipToPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [localState, setLocalState] = useState<ShipToAddress>(
        shipTo || defaultAddress || { name: '' }
    );

    // Sync local state when shipTo changes from parent
    useEffect(() => {
        if (shipTo) {
            setLocalState(shipTo);
        } else if (defaultAddress) {
            setLocalState(defaultAddress);
        }
    }, [shipTo, defaultAddress]);

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
                                className="h-10 w-10 shrink-0"
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

            <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="font-semibold leading-none">Ship To Address</h4>
                        {hasCustomAddress && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={handleReset} title="Reset to Billing Address">
                                <RotateCcw className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                    
                    <div className="grid gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="ship-to-name">Name / Company *</Label>
                            <Input
                                id="ship-to-name"
                                value={localState.name || ''}
                                onChange={(e) => setLocalState(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Recipient Name"
                                autoFocus
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="ship-to-address1">Address Line 1</Label>
                            <Input
                                id="ship-to-address1"
                                value={localState.address_line_1 || ''}
                                onChange={(e) => setLocalState(prev => ({ ...prev, address_line_1: e.target.value }))}
                                placeholder="Street, Area"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="ship-to-address2">Address Line 2</Label>
                            <Input
                                id="ship-to-address2"
                                value={localState.address_line_2 || ''}
                                onChange={(e) => setLocalState(prev => ({ ...prev, address_line_2: e.target.value }))}
                                placeholder="Building, Floor"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="ship-to-city">City</Label>
                                <Input
                                    id="ship-to-city"
                                    value={localState.city || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, city: e.target.value }))}
                                    placeholder="City"
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="ship-to-state">State</Label>
                                <Input
                                    id="ship-to-state"
                                    value={localState.state || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, state: e.target.value }))}
                                    placeholder="State"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="ship-to-pin">PIN Code</Label>
                                <Input
                                    id="ship-to-pin"
                                    value={localState.postal_code || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, postal_code: e.target.value }))}
                                    placeholder="PIN"
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="ship-to-gstin">GSTIN</Label>
                                <Input
                                    id="ship-to-gstin"
                                    value={localState.gstin || ''}
                                    onChange={(e) => setLocalState(prev => ({ ...prev, gstin: e.target.value }))}
                                    placeholder="Optional"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button className="w-full" onClick={handleApply} disabled={!localState.name}>
                            Apply Address
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
