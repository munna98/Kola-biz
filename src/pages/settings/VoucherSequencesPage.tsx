import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconDeviceFloppy, IconRefresh } from '@tabler/icons-react';
import { Label } from '@/components/ui/label';

interface VoucherSequence {
    id: string;
    voucher_type: string;
    prefix: string;
    next_number: number;
    padding: number;
    suffix: string | null;
    separator: string;
    include_financial_year: boolean;
    reset_yearly: boolean;
}

const HUMAN_READABLE_TYPES: Record<string, string> = {
    'sales_invoice': 'Sales Invoice',
    'purchase_invoice': 'Purchase Invoice',
    'sales_return': 'Sales Return',
    'purchase_return': 'Purchase Return',
    'receipt': 'Receipt',
    'payment': 'Payment',
    'journal': 'Journal Entry',
    'stock_journal': 'Stock Journal',
    'opening_stock': 'Opening Stock',
};

export default function VoucherSequencesPage() {
    const [sequences, setSequences] = useState<VoucherSequence[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Form state for the selected sequence
    const [formData, setFormData] = useState<Partial<VoucherSequence>>({});
    const [preview, setPreview] = useState<string>('');

    useEffect(() => {
        loadSequences();
    }, []);

    useEffect(() => {
        if (selectedId && sequences.length > 0) {
            const seq = sequences.find(s => s.id === selectedId);
            if (seq) {
                setFormData(seq);
            }
        }
    }, [selectedId, sequences]);

    useEffect(() => {
        if (formData.prefix !== undefined) {
            updatePreview(formData as VoucherSequence);
        }
    }, [formData]);

    const loadSequences = async () => {
        setLoading(true);
        try {
            const data: VoucherSequence[] = await invoke('list_voucher_sequences');
            setSequences(data);
            if (data.length > 0 && !selectedId) {
                setSelectedId(data[0].id);
            }
        } catch (error: any) {
            console.error(error);
            toast.error(error.toString() || 'Failed to load voucher sequences');
        } finally {
            setLoading(false);
        }
    };

    const updatePreview = async (data: VoucherSequence) => {
        try {
            const result: string = await invoke('preview_voucher_number', { data });
            setPreview(result);
        } catch (error) {
            console.error(error);
            setPreview('Error generating preview');
        }
    };

    const handleSave = async () => {
        if (!selectedId) return;
        setSaving(true);
        try {
            const dataToSave = {
                prefix: formData.prefix || '',
                next_number: Number(formData.next_number) || 1,
                padding: Number(formData.padding) || 4,
                suffix: formData.suffix || null,
                separator: formData.separator || '-',
                include_financial_year: formData.include_financial_year || false,
                reset_yearly: formData.reset_yearly || false,
            };

            await invoke('update_voucher_sequence', { 
                id: selectedId, 
                data: dataToSave 
            });
            
            toast.success('Sequence configuration saved');
            await loadSequences(); // reload to get fresh data
        } catch (error: any) {
            console.error(error);
            toast.error(error.toString() || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof VoucherSequence, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const formatVoucherName = (type: string) => {
        return HUMAN_READABLE_TYPES[type] || type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    if (loading && sequences.length === 0) {
        return <div className="p-6 flex items-center justify-center">Loading settings...</div>;
    }

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Voucher Numbering</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure customized document number formats
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-[220px]">
                        <Select value={selectedId} onValueChange={setSelectedId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Voucher Type" />
                            </SelectTrigger>
                            <SelectContent>
                                {sequences.map(seq => (
                                    <SelectItem key={seq.id} value={seq.id}>
                                        {formatVoucherName(seq.voucher_type)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleSave} disabled={saving}>
                        <IconDeviceFloppy className="mr-2 h-4 w-4" />
                        Save Changes
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-2xl mx-auto space-y-8">
                    
                    {/* Preview Card */}
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center shadow-sm">
                        <Label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2 block">
                            Live Preview (Next Number)
                        </Label>
                        <div className="text-3xl font-mono font-bold tracking-widest text-primary">
                            {preview || "..."}
                        </div>
                    </div>

                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
                        <h3 className="text-lg font-medium border-b pb-2 mb-4">Formatting Rules</h3>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="prefix">Prefix</Label>
                                <Input 
                                    id="prefix" 
                                    value={formData.prefix || ''} 
                                    onChange={e => updateField('prefix', e.target.value)}
                                    placeholder="e.g. INV, RCPT"
                                />
                                <p className="text-xs text-muted-foreground">Appears at the very beginning</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="suffix">Suffix (Optional)</Label>
                                <Input 
                                    id="suffix" 
                                    value={formData.suffix || ''} 
                                    onChange={e => updateField('suffix', e.target.value)}
                                    placeholder="e.g. B2B, POS"
                                />
                                <p className="text-xs text-muted-foreground">Appears at the very end</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="separator">Separator</Label>
                                <Input 
                                    id="separator" 
                                    value={formData.separator || ''} 
                                    onChange={e => updateField('separator', e.target.value)}
                                    placeholder="e.g. - or /"
                                    maxLength={3}
                                />
                                <p className="text-xs text-muted-foreground">Character between segments</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="padding">Number Padding</Label>
                                <Input 
                                    id="padding" 
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={formData.padding || ''} 
                                    onChange={e => updateField('padding', parseInt(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">Ex: Padding 4 = 0001</p>
                            </div>
                        </div>

                        <div className="flex gap-8 pt-4 border-t">
                            <div className="flex items-center space-x-3">
                                <Checkbox 
                                    id="include-fy" 
                                    checked={formData.include_financial_year || false}
                                    onCheckedChange={c => updateField('include_financial_year', !!c)}
                                />
                                <div className="space-y-1 leading-none">
                                    <Label htmlFor="include-fy" className="cursor-pointer">Add Financial Year</Label>
                                    <p className="text-[11px] text-muted-foreground">Includes FY24-25 in the middle</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
                        <div className="flex items-center justify-between border-b pb-2 mb-4">
                            <h3 className="text-lg font-medium">Counter Management</h3>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                    if(confirm('Are you sure you want to reset the counter to 1? This will only affect new vouchers. Existing vouchers are not changed.')) {
                                        updateField('next_number', 1);
                                    }
                                }}
                            >
                                <IconRefresh className="w-4 h-4 mr-2" />
                                Reset to 1
                            </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="next_number">Next Counter Number</Label>
                                <Input 
                                    id="next_number" 
                                    type="number"
                                    value={formData.next_number || ''} 
                                    onChange={e => updateField('next_number', parseInt(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">The number that will be used. Ensure it doesn't conflict with existing vouchers!</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
