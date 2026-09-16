import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    IconDeviceFloppy,
    IconPlus,
    IconCopy,
    IconPencil,
    IconStar,
    IconTrash,
} from '@tabler/icons-react';
import BarcodeLabelDesigner, {
    type BarcodeDesignerSettings,
    DEFAULT_DESIGNER_SETTINGS,
} from '@/components/barcode/BarcodeLabelDesigner';
import {
    loadBarcodeDesigns,
    saveBarcodeDesigns,
} from '@/utils/barcodeSettings';

// Re-export for backward compatibility with BarcodeLabelDialog
export type { BarcodeDesignerSettings as BarcodeSettings } from '@/components/barcode/BarcodeLabelDesigner';

const BARCODE_FORMATS = [
    { value: 'CODE128', label: 'CODE128 (Alphanumeric)' },
    { value: 'EAN13', label: 'EAN-13 (Numeric Only)' },
    { value: 'QR', label: 'QR Code' },
];

export default function BarcodeSettingsPage() {
    const [designs, setDesigns] = useState<BarcodeDesignerSettings[]>([{ ...DEFAULT_DESIGNER_SETTINGS }]);
    const [activeDesignId, setActiveDesignId] = useState<string>('default');
    const [loading, setLoading] = useState(false);
    const [printers, setPrinters] = useState<string[]>([]);

    // Name dialog state for Create / Rename
    const [nameDialogOpen, setNameDialogOpen] = useState(false);
    const [nameDialogMode, setNameDialogMode] = useState<'create' | 'rename'>('create');
    const [designNameInput, setDesignNameInput] = useState('');

    useEffect(() => {
        initData();
    }, []);

    const initData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadAllDesigns(),
                loadPrinters(),
            ]);
        } catch (error) {
            console.error('Failed to initialize barcode settings page:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPrinters = async () => {
        try {
            const printerList = await invoke<string[]>('get_system_printers');
            setPrinters(printerList);
        } catch (error) {
            console.error('Failed to load printers:', error);
        }
    };

    const loadAllDesigns = async () => {
        const loaded = await loadBarcodeDesigns();
        setDesigns(loaded);
        const def = loaded.find(d => d.isDefault) || loaded[0];
        setActiveDesignId(def.id || 'default');
    };

    const activeDesign = designs.find(d => d.id === activeDesignId) || designs[0] || DEFAULT_DESIGNER_SETTINGS;

    const updateActiveDesign = (updates: Partial<BarcodeDesignerSettings>) => {
        setDesigns(prev =>
            prev.map(d => (d.id === activeDesignId ? { ...d, ...updates } : d))
        );
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await saveBarcodeDesigns(designs);
            toast.success('Barcode settings saved successfully');
        } catch (error) {
            console.error('Failed to save barcode settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    // ── Design Management Actions ──

    const handleOpenNewDialog = () => {
        setNameDialogMode('create');
        setDesignNameInput(`Barcode Design ${designs.length + 1}`);
        setNameDialogOpen(true);
    };

    const handleOpenRenameDialog = () => {
        setNameDialogMode('rename');
        setDesignNameInput(activeDesign.name || 'Custom Label');
        setNameDialogOpen(true);
    };

    const handleConfirmNameDialog = () => {
        const trimmed = designNameInput.trim();
        if (!trimmed) {
            toast.error('Design name cannot be empty');
            return;
        }

        if (nameDialogMode === 'create') {
            const newId = `design_${Date.now()}`;
            const newDesign: BarcodeDesignerSettings = {
                ...DEFAULT_DESIGNER_SETTINGS,
                id: newId,
                name: trimmed,
                isDefault: designs.length === 0,
            };
            setDesigns(prev => [...prev, newDesign]);
            setActiveDesignId(newId);
            toast.success(`Created new design "${trimmed}"`);
        } else {
            setDesigns(prev =>
                prev.map(d => (d.id === activeDesignId ? { ...d, name: trimmed } : d))
            );
            toast.success(`Renamed design to "${trimmed}"`);
        }

        setNameDialogOpen(false);
    };

    const handleDuplicateDesign = () => {
        const newId = `design_${Date.now()}`;
        const duplicateName = `${activeDesign.name || 'Design'} (Copy)`;
        const newDesign: BarcodeDesignerSettings = {
            ...activeDesign,
            id: newId,
            name: duplicateName,
            isDefault: false,
        };
        setDesigns(prev => [...prev, newDesign]);
        setActiveDesignId(newId);
        toast.success(`Duplicated to "${duplicateName}"`);
    };

    const handleSetAsDefault = () => {
        setDesigns(prev =>
            prev.map(d => ({
                ...d,
                isDefault: d.id === activeDesignId,
            }))
        );
        toast.success(`"${activeDesign.name}" set as default design`);
    };

    const handleDeleteDesign = () => {
        if (designs.length <= 1) {
            toast.error('Cannot delete the only remaining barcode design');
            return;
        }

        if (!confirm(`Are you sure you want to delete "${activeDesign.name}"?`)) return;

        const remaining = designs.filter(d => d.id !== activeDesignId);
        const wasDefault = activeDesign.isDefault;

        if (wasDefault && remaining.length > 0) {
            remaining[0].isDefault = true;
        }

        setDesigns(remaining);
        setActiveDesignId(remaining[0].id || 'default');
        toast.success(`Deleted design "${activeDesign.name}"`);
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Top Navigation & Action Header */}
            <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Barcode Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Design and manage custom barcode label layouts per business
                    </p>
                </div>
                <Button onClick={handleSave} disabled={loading}>
                    <IconDeviceFloppy className="mr-2 h-4 w-4" />
                    Save All Settings
                </Button>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* ── Multi-Design Management Bar ── */}
                    <div className="bg-card border rounded-lg p-6 space-y-4 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <Label className="text-sm font-semibold whitespace-nowrap">Active Design:</Label>
                                <Select
                                    value={activeDesignId}
                                    onValueChange={setActiveDesignId}
                                >
                                    <SelectTrigger className="w-[280px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {designs.map(d => (
                                            <SelectItem key={d.id} value={d.id || 'default'}>
                                                <div className="flex items-center gap-2">
                                                    <span>{d.name || 'Unnamed Design'}</span>
                                                    {d.isDefault && (
                                                        <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300">
                                                            Default
                                                        </Badge>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="sm" variant="outline" onClick={handleOpenNewDialog}>
                                    <IconPlus size={15} className="mr-1.5" />
                                    New Design
                                </Button>
                                <Button size="sm" variant="outline" onClick={handleDuplicateDesign}>
                                    <IconCopy size={15} className="mr-1.5" />
                                    Duplicate
                                </Button>
                                <Button size="sm" variant="outline" onClick={handleOpenRenameDialog}>
                                    <IconPencil size={15} className="mr-1.5" />
                                    Rename
                                </Button>
                                {!activeDesign.isDefault ? (
                                    <Button size="sm" variant="outline" onClick={handleSetAsDefault}>
                                        <IconStar size={15} className="mr-1.5 text-amber-500" />
                                        Set as Default
                                    </Button>
                                ) : (
                                    <Badge variant="outline" className="px-3 py-1.5 text-xs bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 flex items-center gap-1">
                                        <IconStar size={14} className="fill-amber-500 text-amber-500" />
                                        Default Design
                                    </Badge>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleDeleteDesign}
                                    disabled={designs.length <= 1}
                                    className="text-destructive hover:bg-destructive/10"
                                >
                                    <IconTrash size={15} className="mr-1.5" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ── Barcode Format + Printer ── */}
                    <div className="bg-card border rounded-lg p-6">
                        <div className="flex flex-wrap gap-6">
                            {/* Barcode Format */}
                            <div className="space-y-2">
                                <Label>Barcode Format</Label>
                                <Select
                                    value={activeDesign.barcodeFormat}
                                    onValueChange={(value) => updateActiveDesign({ barcodeFormat: value as BarcodeDesignerSettings['barcodeFormat'] })}
                                >
                                    <SelectTrigger className="w-[240px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BARCODE_FORMATS.map(format => (
                                            <SelectItem key={format.value} value={format.value}>
                                                {format.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    CODE128 works with any text. EAN-13 requires 12-13 digit numbers.
                                </p>
                            </div>

                            {/* Barcode Printer */}
                            <div className="space-y-2">
                                <Label>Barcode Printer</Label>
                                <Select
                                    value={activeDesign.barcodePrinter || ''}
                                    onValueChange={(value) => updateActiveDesign({ barcodePrinter: value })}
                                    disabled={!printers.length}
                                >
                                    <SelectTrigger className="w-[240px]">
                                        <SelectValue placeholder={printers.length ? "Select a barcode printer" : "No printers found"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {printers.map((printer) => (
                                            <SelectItem key={printer} value={printer}>
                                                {printer}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Select the printer to use for barcode labels
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── Label Designer ── */}
                    <div className="bg-card border rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium">Label Designer — {activeDesign.name}</h3>
                        </div>
                        <BarcodeLabelDesigner
                            settings={activeDesign}
                            onChange={updateActiveDesign}
                        />
                    </div>

                    {/* ── Roll / Sheet Layout ── */}
                    <div className="bg-card border rounded-lg p-6">
                        <h3 className="text-lg font-medium mb-1">Roll / Sheet Layout</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                            If your roll is wider than one label, set columns &gt; 1 to print side by side.
                        </p>
                        <div className="flex flex-wrap gap-6">
                            <div className="space-y-2">
                                <Label>Columns per Row</Label>
                                <Input
                                    type="number" min={1} max={6} step={1}
                                    value={activeDesign.columnsPerRow}
                                    onChange={e => updateActiveDesign({ columnsPerRow: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="w-20"
                                />
                                <p className="text-xs text-muted-foreground">
                                    How many labels fit across the roll width
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Horizontal Gap (mm)</Label>
                                <Input
                                    type="number" min={0} max={20} step={0.5}
                                    value={activeDesign.horizontalGap}
                                    onChange={e => updateActiveDesign({ horizontalGap: Math.max(0, parseFloat(e.target.value) || 0) })}
                                    className="w-20"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Gap between labels in same row
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Vertical Gap (mm)</Label>
                                <Input
                                    type="number" min={0} max={20} step={0.5}
                                    value={activeDesign.verticalGap}
                                    onChange={e => updateActiveDesign({ verticalGap: Math.max(0, parseFloat(e.target.value) || 0) })}
                                    className="w-20"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Gap between rows of labels
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Creating or Renaming Design */}
            <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {nameDialogMode === 'create' ? 'Create New Barcode Design' : 'Rename Barcode Design'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label htmlFor="design-name">Design Name</Label>
                        <Input
                            id="design-name"
                            value={designNameInput}
                            onChange={e => setDesignNameInput(e.target.value)}
                            placeholder="e.g. Jewelry Tag 40x15, Apparel Label 50x25"
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleConfirmNameDialog();
                                }
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirmNameDialog}>
                            {nameDialogMode === 'create' ? 'Create Design' : 'Save Name'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
