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
import { Globe, RotateCcw } from 'lucide-react';
import { IconRepeat } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface CountryItem {
    id: string;
    name: string;
    code?: string;
}

export interface ExportDetails {
    country_of_origin?: string;
    country_of_destination?: string;
    pre_carriage_by?: string;
    place_of_receipt?: string;
    port_of_loading?: string;
    port_of_discharge?: string;
    final_destination?: string;
}

interface ExportDetailsPopoverProps {
    exportDetails: ExportDetails | undefined;
    onChange: (exportDetails: ExportDetails | undefined) => void;
    defaultOriginCountry?: string;
    defaultDestinationCountry?: string;
    disabled?: boolean;
    partyId?: string | number;
}

export function ExportDetailsPopover({
    exportDetails,
    onChange,
    defaultOriginCountry,
    defaultDestinationCountry,
    disabled,
    partyId,
}: ExportDetailsPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [countries, setCountries] = useState<CountryItem[]>([]);
    const [recentDetails, setRecentDetails] = useState<ExportDetails[]>([]);

    const resolveCountryName = (val?: string, list: CountryItem[] = countries): string => {
        if (!val) return '';
        const match = list.find(
            (c) =>
                c.id === val ||
                (c.code && c.code.toLowerCase() === val.toLowerCase()) ||
                c.name.toLowerCase() === val.toLowerCase()
        );
        return match ? match.name : val;
    };

    const buildInitialState = (): ExportDetails => ({
        country_of_origin: resolveCountryName(exportDetails?.country_of_origin ?? defaultOriginCountry ?? 'India'),
        country_of_destination: resolveCountryName(exportDetails?.country_of_destination ?? defaultDestinationCountry ?? ''),
        pre_carriage_by: exportDetails?.pre_carriage_by ?? '',
        place_of_receipt: exportDetails?.place_of_receipt ?? '',
        port_of_loading: exportDetails?.port_of_loading ?? '',
        port_of_discharge: exportDetails?.port_of_discharge ?? '',
        final_destination: exportDetails?.final_destination ?? '',
    });

    const [localState, setLocalState] = useState<ExportDetails>(buildInitialState);

    // Load country list immediately on mount
    useEffect(() => {
        invoke<CountryItem[]>('get_countries')
            .then((list) => setCountries(list || []))
            .catch(() => {});
    }, []);

    // When countries list loads, resolve any ID/code in local state or defaults to name
    useEffect(() => {
        if (countries.length > 0) {
            setLocalState((prev) => {
                const resolvedOrigin = resolveCountryName(prev.country_of_origin || defaultOriginCountry || 'India', countries);
                const resolvedDest = resolveCountryName(prev.country_of_destination || defaultDestinationCountry || '', countries);
                if (resolvedOrigin !== prev.country_of_origin || resolvedDest !== prev.country_of_destination) {
                    return {
                        ...prev,
                        country_of_origin: resolvedOrigin,
                        country_of_destination: resolvedDest,
                    };
                }
                return prev;
            });
        }
    }, [countries, defaultOriginCountry, defaultDestinationCountry]);

    // Sync local state when exportDetails or defaults change
    useEffect(() => {
        if (exportDetails) {
            setLocalState({
                country_of_origin: resolveCountryName(exportDetails.country_of_origin ?? defaultOriginCountry ?? 'India', countries),
                country_of_destination: resolveCountryName(exportDetails.country_of_destination ?? defaultDestinationCountry ?? '', countries),
                pre_carriage_by: exportDetails.pre_carriage_by ?? '',
                place_of_receipt: exportDetails.place_of_receipt ?? '',
                port_of_loading: exportDetails.port_of_loading ?? '',
                port_of_discharge: exportDetails.port_of_discharge ?? '',
                final_destination: exportDetails.final_destination ?? '',
            });
        } else {
            setLocalState({
                country_of_origin: resolveCountryName(defaultOriginCountry ?? 'India', countries),
                country_of_destination: resolveCountryName(defaultDestinationCountry ?? '', countries),
                pre_carriage_by: '',
                place_of_receipt: '',
                port_of_loading: '',
                port_of_discharge: '',
                final_destination: '',
            });
        }
    }, [exportDetails, defaultOriginCountry, defaultDestinationCountry, countries]);

    // Load recent export details for this party when popover opens
    useEffect(() => {
        if (partyId && isOpen) {
            invoke<ExportDetails[]>('get_recent_export_details', { partyId: String(partyId) })
                .then((res) => setRecentDetails(res || []))
                .catch((err) => console.error('Failed to load recent export details', err));
        }
    }, [partyId, isOpen]);

    const handleApply = () => {
        onChange(localState);
        setIsOpen(false);
    };

    const handleReset = () => {
        const resetDetails: ExportDetails = {
            country_of_origin: resolveCountryName(defaultOriginCountry ?? 'India', countries),
            country_of_destination: resolveCountryName(defaultDestinationCountry ?? '', countries),
            pre_carriage_by: '',
            place_of_receipt: '',
            port_of_loading: '',
            port_of_discharge: '',
            final_destination: '',
        };
        setLocalState(resetDetails);
        onChange(undefined);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent, nextId?: string, isLast?: boolean) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (isLast) {
                handleApply();
            } else if (nextId) {
                const nextElement = document.getElementById(nextId);
                if (nextElement) {
                    nextElement.focus();
                }
            }
        }
    };

    const hasCustomDetails =
        exportDetails !== undefined &&
        Object.values(exportDetails).some((v) => typeof v === 'string' && v.trim().length > 0);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <datalist id="export-countries-list">
                {countries.map((c) => (
                    <option key={c.id || c.name} value={c.name} />
                ))}
            </datalist>

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                variant={hasCustomDetails ? 'default' : 'outline'}
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={disabled}
                            >
                                <Globe className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                        {hasCustomDetails ? 'Edit Export Details' : 'Add Export Details'}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <PopoverContent className="w-[440px] p-4" align="end">
                <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                        <div className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-primary" />
                            <h4 className="font-semibold text-xs text-foreground leading-none">Export Details</h4>
                        </div>
                        <div className="flex items-center gap-1">
                            {recentDetails.length > 0 && (
                                recentDetails.length === 1 ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            setLocalState({
                                                ...recentDetails[0],
                                                country_of_origin: resolveCountryName(recentDetails[0].country_of_origin),
                                                country_of_destination: resolveCountryName(recentDetails[0].country_of_destination),
                                            });
                                            toast.success('Reused previous export details');
                                        }}
                                        title={`Reuse previous export details (${recentDetails[0].port_of_loading || recentDetails[0].country_of_destination || ''})`}
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
                                                title="Reuse previous export details"
                                            >
                                                <IconRepeat size={14} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-64">
                                            <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">
                                                Previous Export Details ({recentDetails.length})
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {recentDetails.map((exp, idx) => (
                                                <DropdownMenuItem
                                                    key={idx}
                                                    className="flex flex-col items-start gap-0.5 cursor-pointer py-1.5"
                                                    onClick={() => {
                                                        setLocalState({
                                                            ...exp,
                                                            country_of_origin: resolveCountryName(exp.country_of_origin),
                                                            country_of_destination: resolveCountryName(exp.country_of_destination),
                                                        });
                                                        toast.success('Loaded previous export details');
                                                    }}
                                                >
                                                    <span className="font-medium text-xs truncate max-w-[240px]">
                                                        {exp.country_of_destination || 'Unknown Dest'}
                                                        {exp.port_of_loading ? ` via ${exp.port_of_loading}` : ''}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[240px]">
                                                        {[exp.pre_carriage_by, exp.port_of_discharge, exp.final_destination].filter(Boolean).join(' • ')}
                                                    </span>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )
                            )}
                            {hasCustomDetails && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                    onClick={handleReset}
                                    title="Reset Export Details"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-2.5">
                        {/* 1 & 2: Origin and Destination */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                                <Label htmlFor="exp-origin" className="text-xs font-medium text-muted-foreground">
                                    Country of Origin
                                </Label>
                                <Input
                                    id="exp-origin"
                                    list="export-countries-list"
                                    value={localState.country_of_origin || ''}
                                    onChange={(e) => setLocalState((prev) => ({ ...prev, country_of_origin: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'exp-destination')}
                                    placeholder="e.g. India"
                                    className="h-8 text-xs px-2.5"
                                    autoFocus
                                />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="exp-destination" className="text-xs font-medium text-muted-foreground">
                                    Country of Destination
                                </Label>
                                <Input
                                    id="exp-destination"
                                    list="export-countries-list"
                                    value={localState.country_of_destination || ''}
                                    onChange={(e) => setLocalState((prev) => ({ ...prev, country_of_destination: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'exp-precarriage')}
                                    placeholder="e.g. United States"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                        </div>

                        {/* 3 & 4: Pre-carriage & Place of Receipt */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                                <Label htmlFor="exp-precarriage" className="text-xs font-medium text-muted-foreground">
                                    Pre-carriage by (Vessel/Flight No)
                                </Label>
                                <Input
                                    id="exp-precarriage"
                                    value={localState.pre_carriage_by || ''}
                                    onChange={(e) => setLocalState((prev) => ({ ...prev, pre_carriage_by: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'exp-receipt')}
                                    placeholder="e.g. Air India AI101"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="exp-receipt" className="text-xs font-medium text-muted-foreground">
                                    Place of Receipt by Pre-carrier
                                </Label>
                                <Input
                                    id="exp-receipt"
                                    value={localState.place_of_receipt || ''}
                                    onChange={(e) => setLocalState((prev) => ({ ...prev, place_of_receipt: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'exp-loading')}
                                    placeholder="e.g. ICD Bangalore"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                        </div>

                        {/* 5 & 6: Port of Loading & Port of Discharge */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                                <Label htmlFor="exp-loading" className="text-xs font-medium text-muted-foreground">
                                    Port of Loading
                                </Label>
                                <Input
                                    id="exp-loading"
                                    value={localState.port_of_loading || ''}
                                    onChange={(e) => setLocalState((prev) => ({ ...prev, port_of_loading: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'exp-discharge')}
                                    placeholder="e.g. Chennai Sea Port"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                            <div className="grid gap-1">
                                <Label htmlFor="exp-discharge" className="text-xs font-medium text-muted-foreground">
                                    Port of Discharge
                                </Label>
                                <Input
                                    id="exp-discharge"
                                    value={localState.port_of_discharge || ''}
                                    onChange={(e) => setLocalState((prev) => ({ ...prev, port_of_discharge: e.target.value }))}
                                    onKeyDown={(e) => handleKeyDown(e, 'exp-final')}
                                    placeholder="e.g. Port of Rotterdam"
                                    className="h-8 text-xs px-2.5"
                                />
                            </div>
                        </div>

                        {/* 7: Final Destination */}
                        <div className="grid gap-1">
                            <Label htmlFor="exp-final" className="text-xs font-medium text-muted-foreground">
                                Final Destination
                            </Label>
                            <Input
                                id="exp-final"
                                value={localState.final_destination || ''}
                                onChange={(e) => setLocalState((prev) => ({ ...prev, final_destination: e.target.value }))}
                                onKeyDown={(e) => handleKeyDown(e, undefined, true)}
                                placeholder="e.g. Amsterdam, Netherlands"
                                className="h-8 text-xs px-2.5"
                            />
                        </div>
                    </div>

                    <div className="pt-1">
                        <Button
                            id="export-details-apply-btn"
                            size="sm"
                            className="w-full h-8 text-xs font-medium"
                            onClick={handleApply}
                        >
                            Apply Export Details
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
