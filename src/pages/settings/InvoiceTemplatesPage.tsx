import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    IconFileInvoice,
    IconReceipt,
    IconEye,
    IconCheck,
    IconStar,
    IconPrinter,
    IconEdit,
    IconPlus,
    IconRefresh,
} from '@tabler/icons-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner';
import { usePrint } from '@/hooks/usePrint';

interface InvoiceTemplate {
    id: number;
    name: string;
    description: string;
    voucher_type: string;
    template_format: string;
    design_mode: string | null;
    is_default: number;
    // Features
    show_logo: number;
    show_company_address: number;
    show_party_name: number;
    show_party_address: number;
    show_gstin: number;
    show_item_images: number;
    show_item_hsn: number;
    show_bank_details: number;
    show_qr_code: number;
    show_signature: number;
    show_terms: number;
    show_less_column: number;
    show_discount_column: number;
    show_balance_section: number;
    table_row_padding: number;
    // Balance section style (thermal only)
    balance_font_size: number;
    balance_bold: number;
    // Custom Text Labels
    header_title?: string | null;
    bill_note?: string | null;
}

const FEATURE_LABELS: Record<string, string> = {
    show_logo: 'Logo',
    show_company_address: 'Company Address',
    show_party_name: 'Party Name',
    show_party_address: 'Party Address',
    show_gstin: 'GSTIN',
    show_item_images: 'Item Images',
    show_item_hsn: 'HSN/SAC',
    show_bank_details: 'Bank Details',
    show_qr_code: 'QR Code',
    show_signature: 'Signature',
    show_terms: 'Terms',
    show_less_column: 'Show Less Column',
    show_discount_column: 'Discount Amount Column',
    show_balance_section: 'Customer Balance',
};

const VOUCHER_TYPE_OPTIONS = [
    { value: 'all', label: 'All Vouchers' },
    { value: 'sales_invoice', label: 'Sales Invoice' },
    { value: 'sales_return', label: 'Sales Return' },
    { value: 'delivery_note', label: 'Delivery Note' },
    { value: 'purchase_invoice', label: 'Purchase Invoice' },
    { value: 'payment', label: 'Payment Voucher' },
    { value: 'receipt', label: 'Receipt Voucher' },
];

export function InvoiceTemplatesPage() {
    const dispatch = useDispatch();
    const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const { print } = usePrint();
    const [printSettings, setPrintSettings] = useState({ silent_print: false, default_printer: '' });
    const [printers, setPrinters] = useState<string[]>([]);
    const [selectedVoucherType, setSelectedVoucherType] = useState<string>('all');


    useEffect(() => {
        loadTemplates();
        loadPrintSettings();
    }, []);

    const loadPrintSettings = async () => {
        try {
            const [settings, printerList] = await Promise.all([
                invoke<{ silent_print: boolean, default_printer: string | null }>('get_print_settings'),
                invoke<string[]>('get_system_printers')
            ]);
            setPrintSettings({
                silent_print: settings.silent_print,
                default_printer: settings.default_printer || ''
            });
            setPrinters(printerList);
        } catch (error) {
            console.error('Failed to load print settings', error);
        }
    };

    const handleUpdatePrintSettings = async (key: string, value: any) => {
        try {
            const newSettings = { ...printSettings, [key]: value };
            setPrintSettings(newSettings);
            await invoke('save_print_settings', {
                settings: {
                    silent_print: newSettings.silent_print,
                    default_printer: newSettings.default_printer || null
                }
            });
            toast.success('Print settings saved');
        } catch (error) {
            toast.error('Failed to save print settings');
        }
    };
    const loadTemplates = async () => {
        try {
            setLoading(true);
            const data = await invoke<InvoiceTemplate[]>('get_invoice_templates');
            setTemplates(data);
        } catch (error) {
            toast.error('Failed to load templates');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSetDefault = async (templateId: number, voucherType: string) => {
        try {
            await invoke('set_default_template', { templateId, voucherType });
            setTemplates((prev) =>
                prev.map((t) =>
                    t.voucher_type === voucherType
                        ? { ...t, is_default: t.id === templateId ? 1 : 0 }
                        : t
                )
            );
            toast.success('Default template updated');
        } catch (error) {
            toast.error('Failed to set default template');
        }
    };

    const handleResetToDefault = async (templateId: number) => {
        try {
            await invoke('reset_template_to_default', { templateId: templateId.toString() });
            await loadTemplates();
            toast.success('Template reset to original design');
        } catch (error) {
            toast.error('Failed to reset template');
            console.error(error);
        }
    };

    const handleToggleFeature = async (
        templateId: number,
        feature: string,
        checked: boolean
    ) => {
        try {
            await invoke('update_template_settings', {
                templateId,
                settings: { [feature]: checked },
            });
            setTemplates((prev) =>
                prev.map((t) =>
                    t.id === templateId ? { ...t, [feature]: checked ? 1 : 0 } : t
                )
            );
        } catch (error) {
            toast.error('Failed to update setting');
        }
    };


    const handlePreview = (template: InvoiceTemplate) => {
        // Use dummy ID "1" for preview - backend should handle with sample data
        print({ voucherId: '1', voucherType: template.voucher_type, templateId: template.id });
    }

    // Group by voucher type
    const groupedTemplates = templates.reduce((acc, template) => {
        if (!acc[template.voucher_type]) acc[template.voucher_type] = [];
        acc[template.voucher_type].push(template);
        return acc;
    }, {} as Record<string, InvoiceTemplate[]>);

    const getVoucherLabel = (type: string) => {
        switch (type) {
            case 'sales_invoice': return 'Sales Invoice';
            case 'sales_return': return 'Sales Return';
            case 'purchase_invoice': return 'Purchase Invoice';
            case 'payment': return 'Payment Voucher';
            case 'receipt': return 'Receipt Voucher';
            default: return type.replace('_', ' ').toUpperCase();
        }
    }

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Invoice Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your invoice templates and printing preferences
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-[200px]">
                        <Select value={selectedVoucherType} onValueChange={setSelectedVoucherType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by voucher" />
                            </SelectTrigger>
                            <SelectContent>
                                {VOUCHER_TYPE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={() => dispatch({ type: 'app/setActiveSectionWithParams', payload: { section: 'invoice_designer' } })}>
                        <IconPlus size={16} className="mr-2" />
                        Create Custom Template
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="grid gap-6">
                        {/* Global Print Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <IconPrinter size={20} />
                            Global Print Settings
                        </CardTitle>
                        <CardDescription>
                            Configure how invoices are printed across the application
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                            <div className="space-y-0.5">
                                <Label className="text-base">Silent Printing</Label>
                                <p className="text-sm text-muted-foreground">
                                    Skip the print preview dialog and print directly to the default printer
                                </p>
                            </div>
                            <Switch
                                checked={printSettings.silent_print}
                                onCheckedChange={(checked) => handleUpdatePrintSettings('silent_print', checked)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Default Printer</Label>
                            <Select
                                value={printSettings.default_printer}
                                onValueChange={(value) => handleUpdatePrintSettings('default_printer', value)}
                                disabled={!printers.length}
                            >
                                <SelectTrigger className="w-full md:w-[400px]">
                                    <SelectValue placeholder={printers.length ? "Select a printer" : "No printers found"} />
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
                                Required for silent printing. If not set, the system default will be used.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {loading ? (
                    <div className="flex justify-center p-8">Loading templates...</div>
                ) : Object.entries(groupedTemplates)
                    .filter(([type]) => selectedVoucherType === 'all' || type === selectedVoucherType)
                    .map(([type, typeTemplates]) => (
                        <Card key={type}>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {type === 'sales_invoice' || type === 'purchase_invoice' || type === 'sales_return' ? (
                                    <IconFileInvoice size={20} />
                                ) : (
                                    <IconReceipt size={20} />
                                )}
                                {getVoucherLabel(type)}
                            </CardTitle>
                            <CardDescription>
                                Manage templates for {getVoucherLabel(type).toLowerCase()}s
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {typeTemplates.map((template) => (
                                    <div
                                        key={template.id}
                                        className={`border rounded-xl overflow-hidden transition-all ${template.is_default
                                            ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                                            : 'hover:border-foreground/20'
                                            }`}
                                    >
                                        {/* Header */}
                                        <div className="p-4 border-b bg-card">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div>
                                                    <h4 className="font-semibold text-sm">{template.name}</h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        {template.template_format.replace('_', ' ')}
                                                    </p>
                                                </div>
                                                {template.is_default === 1 && (
                                                    <Badge variant="default" className="gap-1 text-[10px] h-5">
                                                        <IconStar size={10} className="fill-current" />
                                                        Default
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="flex gap-2 mt-3">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 h-7 text-xs"
                                                    onClick={() => handlePreview(template)}
                                                >
                                                    <IconEye size={12} className="mr-1.5" />
                                                    Preview
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 h-7 text-xs"
                                                    onClick={() => dispatch({ type: 'app/setActiveSectionWithParams', payload: { section: 'invoice_designer', params: { templateId: template.id.toString(), voucherType: template.voucher_type } } })}
                                                >
                                                    <IconEdit size={12} className="mr-1.5" />
                                                    Design
                                                </Button>
                                                {template.is_default === 0 && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="flex-1 h-7 text-xs"
                                                        onClick={() => handleSetDefault(template.id, type)}
                                                    >
                                                        <IconCheck size={12} className="mr-1.5" />
                                                        Set Default
                                                    </Button>
                                                )}
                                                {template.design_mode === 'designer' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs text-muted-foreground"
                                                        onClick={() => handleResetToDefault(template.id)}
                                                    >
                                                        <IconRefresh size={12} className="mr-1" />
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Features Toggles */}
                                        <div className="p-3 bg-muted/30 space-y-2">
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                                Display Options
                                            </p>
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                                                    const val = (template as any)[key];
                                                    if (val === undefined || val === null) return null;
                                                    return (
                                                        <div key={key} className="flex items-center space-x-2">
                                                            <Switch
                                                                id={`${template.id}-${key}`}
                                                                checked={val === 1}
                                                                onCheckedChange={(c: boolean) => handleToggleFeature(template.id, key, c)}
                                                                className="h-4 w-7"
                                                            />
                                                            <Label
                                                                htmlFor={`${template.id}-${key}`}
                                                                className="text-[11px] font-normal cursor-pointer select-none"
                                                            >
                                                                {label}
                                                            </Label>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {/* Custom Header Title & Bill Note */}
                                            <div className="border-t pt-3 mt-3 space-y-3">
                                                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                                    Custom Header & Bill Note
                                                </Label>
                                                <div className="grid gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-muted-foreground block mb-1">Header Title</Label>
                                                        <input
                                                            type="text"
                                                            placeholder="INVOICE (Default)"
                                                            value={template.header_title ?? ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setTemplates((prev) =>
                                                                    prev.map((t) => (t.id === template.id ? { ...t, header_title: val } : t))
                                                                );
                                                            }}
                                                            onBlur={async (e) => {
                                                                try {
                                                                    await invoke('update_template_settings', {
                                                                        templateId: template.id.toString(),
                                                                        settings: { header_title: e.target.value },
                                                                    });
                                                                    toast.success('Header title updated');
                                                                } catch (error) {
                                                                    toast.error('Failed to update header title');
                                                                }
                                                            }}
                                                            className="w-full h-8 px-2.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-muted-foreground block mb-1">Bill Note / Thank You Note</Label>
                                                        <input
                                                            type="text"
                                                            placeholder="THANK YOU FOR YOUR PURCHASE (Default)"
                                                            value={template.bill_note ?? ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setTemplates((prev) =>
                                                                    prev.map((t) => (t.id === template.id ? { ...t, bill_note: val } : t))
                                                                );
                                                            }}
                                                            onBlur={async (e) => {
                                                                try {
                                                                    await invoke('update_template_settings', {
                                                                        templateId: template.id.toString(),
                                                                        settings: { bill_note: e.target.value },
                                                                    });
                                                                    toast.success('Bill note updated');
                                                                } catch (error) {
                                                                    toast.error('Failed to update bill note');
                                                                }
                                                            }}
                                                            className="w-full h-8 px-2.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                             {/* Table Row Padding Slider */}
                                             {template.template_format !== 'thermal_80mm' && (
                                                 <div className="border-t pt-3 mt-3 space-y-2">
                                                     <div className="flex justify-between items-center">
                                                         <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                             Table Row Padding
                                                         </Label>
                                                         <span className="text-[11px] font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">
                                                             {template.table_row_padding ?? 8}px
                                                         </span>
                                                     </div>
                                                     <div className="flex items-center gap-3">
                                                         <span className="text-[10px] text-muted-foreground">Compact</span>
                                                         <input
                                                             type="range"
                                                             min="2"
                                                             max="20"
                                                             value={template.table_row_padding ?? 8}
                                                             onChange={async (e) => {
                                                                 const val = parseInt(e.target.value, 10);
                                                                 try {
                                                                     await invoke('update_template_settings', {
                                                                         templateId: template.id.toString(),
                                                                         settings: { table_row_padding: val },
                                                                     });
                                                                     setTemplates((prev) =>
                                                                         prev.map((t) =>
                                                                             t.id === template.id ? { ...t, table_row_padding: val } : t
                                                                         )
                                                                     );
                                                                 } catch (error) {
                                                                     toast.error('Failed to update padding');
                                                                 }
                                                             }}
                                                             className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                                         />
                                                         <span className="text-[10px] text-muted-foreground">Spacious</span>
                                                     </div>
                                                 </div>
                                             )}

                                             {/* Background Letterhead Scan Settings */}
                                             {template.template_format !== 'thermal_80mm' && (
                                                 <div className="border-t pt-3 mt-3 space-y-3">
                                                     <div className="flex items-center justify-between">
                                                         <div className="space-y-0.5">
                                                             <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                                                 Use Letterhead Background
                                                             </Label>
                                                             <span className="text-[10px] text-muted-foreground block">
                                                                 Render blank scanned pad as background
                                                             </span>
                                                         </div>
                                                         <Switch
                                                             checked={(template as any).use_letterhead === 1}
                                                             onCheckedChange={async (checked) => {
                                                                 try {
                                                                     await invoke('update_template_settings', {
                                                                         templateId: template.id.toString(),
                                                                         settings: { use_letterhead: checked },
                                                                     });
                                                                     setTemplates((prev) =>
                                                                         prev.map((t) =>
                                                                             t.id === template.id ? { ...t, use_letterhead: checked ? 1 : 0 } : t
                                                                         )
                                                                     );
                                                                     toast.success(checked ? 'Letterhead background enabled' : 'Letterhead background disabled');
                                                                 } catch (error) {
                                                                     toast.error('Failed to update letterhead setting');
                                                                 }
                                                             }}
                                                             className="h-4 w-7"
                                                         />
                                                     </div>

                                                     {(template as any).use_letterhead === 1 && (
                                                         <div className="space-y-3 bg-muted/40 p-2.5 rounded-md border border-dashed">
                                                             {/* Image upload area */}
                                                             <div className="space-y-1">
                                                                 <Label className="text-[10px] font-medium text-muted-foreground">
                                                                     Letterhead Image (Scan)
                                                                 </Label>
                                                                 <div className="flex items-center gap-2">
                                                                     {(template as any).letterhead_data ? (
                                                                         <div className="relative group w-12 h-16 border rounded bg-background overflow-hidden flex items-center justify-center">
                                                                             <img
                                                                                 src={(template as any).letterhead_data}
                                                                                 alt="Letterhead Preview"
                                                                                 className="w-full h-full object-contain"
                                                                             />
                                                                             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                                 <Button
                                                                                     type="button"
                                                                                     variant="ghost"
                                                                                     size="icon"
                                                                                     className="h-6 w-6 text-white hover:text-red-400"
                                                                                     onClick={async () => {
                                                                                         try {
                                                                                             await invoke('update_template_settings', {
                                                                                                 templateId: template.id.toString(),
                                                                                                 settings: { letterhead_data: null },
                                                                                             });
                                                                                             setTemplates((prev) =>
                                                                                                 prev.map((t) =>
                                                                                                     t.id === template.id ? { ...t, letterhead_data: null } : t
                                                                                                 )
                                                                                             );
                                                                                             toast.success('Letterhead image removed');
                                                                                         } catch (error) {
                                                                                             toast.error('Failed to remove image');
                                                                                         }
                                                                                     }}
                                                                                 >
                                                                                     <span className="text-[10px] font-bold">Remove</span>
                                                                                 </Button>
                                                                             </div>
                                                                         </div>
                                                                     ) : null}
                                                                     <Button
                                                                         type="button"
                                                                         variant="outline"
                                                                         size="sm"
                                                                         className="h-8 text-xs flex-1"
                                                                         onClick={() => {
                                                                             const input = document.createElement('input');
                                                                             input.type = 'file';
                                                                             input.accept = 'image/*';
                                                                             input.onchange = (e) => {
                                                                                 const file = (e.target as HTMLInputElement).files?.[0];
                                                                                 if (!file) return;
                                                                                 const reader = new FileReader();
                                                                                 reader.onload = async () => {
                                                                                     const base64 = reader.result as string;
                                                                                     try {
                                                                                         await invoke('update_template_settings', {
                                                                                             templateId: template.id.toString(),
                                                                                             settings: { letterhead_data: base64 },
                                                                                         });
                                                                                         setTemplates((prev) =>
                                                                                             prev.map((t) =>
                                                                                                 t.id === template.id ? { ...t, letterhead_data: base64 } : t
                                                                                             )
                                                                                         );
                                                                                         toast.success('Letterhead image uploaded');
                                                                                     } catch (err) {
                                                                                         toast.error('Failed to save image');
                                                                                     }
                                                                                 };
                                                                                 reader.readAsDataURL(file);
                                                                             };
                                                                             input.click();
                                                                         }}
                                                                     >
                                                                         {(template as any).letterhead_data ? 'Change Scan' : 'Upload Blank Scan'}
                                                                     </Button>
                                                                 </div>
                                                             </div>

                                                             {/* Margins */}
                                                             <div className="grid grid-cols-2 gap-2 border-t pt-2.5">
                                                                 <div className="space-y-1">
                                                                     <div className="flex justify-between items-center">
                                                                         <Label className="text-[9px] font-medium text-muted-foreground uppercase">
                                                                             Top Margin
                                                                         </Label>
                                                                         <span className="text-[9px] font-mono bg-muted px-1 rounded">
                                                                             {((template as any).letterhead_margin_top ?? 45)}mm
                                                                         </span>
                                                                     </div>
                                                                     <input
                                                                         type="range"
                                                                         min="0"
                                                                         max="150"
                                                                         step="1"
                                                                         value={((template as any).letterhead_margin_top ?? 45)}
                                                                         onChange={async (e) => {
                                                                             const val = parseFloat(e.target.value);
                                                                             try {
                                                                                 await invoke('update_template_settings', {
                                                                                     templateId: template.id.toString(),
                                                                                     settings: { letterhead_margin_top: val },
                                                                                 });
                                                                                 setTemplates((prev) =>
                                                                                     prev.map((t) =>
                                                                                         t.id === template.id ? { ...t, letterhead_margin_top: val } : t
                                                                                     )
                                                                                 );
                                                                             } catch (error) {
                                                                                 console.error(error);
                                                                             }
                                                                         }}
                                                                         className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                                                     />
                                                                 </div>

                                                                 <div className="space-y-1">
                                                                     <div className="flex justify-between items-center">
                                                                         <Label className="text-[9px] font-medium text-muted-foreground uppercase">
                                                                             Bottom Margin
                                                                         </Label>
                                                                         <span className="text-[9px] font-mono bg-muted px-1 rounded">
                                                                             {((template as any).letterhead_margin_bottom ?? 25)}mm
                                                                         </span>
                                                                     </div>
                                                                     <input
                                                                         type="range"
                                                                         min="0"
                                                                         max="100"
                                                                         step="1"
                                                                         value={((template as any).letterhead_margin_bottom ?? 25)}
                                                                         onChange={async (e) => {
                                                                             const val = parseFloat(e.target.value);
                                                                             try {
                                                                                 await invoke('update_template_settings', {
                                                                                     templateId: template.id.toString(),
                                                                                     settings: { letterhead_margin_bottom: val },
                                                                                 });
                                                                                 setTemplates((prev) =>
                                                                                     prev.map((t) =>
                                                                                         t.id === template.id ? { ...t, letterhead_margin_bottom: val } : t
                                                                                     )
                                                                                 );
                                                                             } catch (error) {
                                                                                 console.error(error);
                                                                             }
                                                                         }}
                                                                         className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                                                     />
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     )}
                                                 </div>
                                             )}
                                         </div>

                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}


                    </div>
                </div>
            </div>
        </div>
    );
}
