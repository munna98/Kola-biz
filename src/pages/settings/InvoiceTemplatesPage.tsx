import { useEffect, useState } from 'react';
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
    is_default: number;
    // Features
    show_logo: number;
    show_company_address: number;
    show_party_address: number;
    show_gstin: number;
    show_item_images: number;
    show_item_hsn: number;
    show_bank_details: number;
    show_qr_code: number;
    show_signature: number;
    show_terms: number;
}

const FEATURE_LABELS: Record<string, string> = {
    show_logo: 'Logo',
    show_company_address: 'Company Address',
    show_party_address: 'Party Address',
    show_gstin: 'GSTIN',
    show_item_images: 'Item Images',
    show_item_hsn: 'HSN/SAC',
    show_bank_details: 'Bank Details',
    show_qr_code: 'QR Code',
    show_signature: 'Signature',
    show_terms: 'Terms',
};

export function InvoiceTemplatesPage() {
    const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const { print } = usePrint();
    const [printSettings, setPrintSettings] = useState({ silent_print: false, default_printer: '' });
    const [printers, setPrinters] = useState<string[]>([]);


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
            // Update local state
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
            // Update local state
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
            case 'purchase_invoice': return 'Purchase Invoice';
            case 'payment': return 'Payment Voucher';
            case 'receipt': return 'Receipt Voucher';
            default: return type.replace('_', ' ').toUpperCase();
        }
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Invoice Settings</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your invoice templates and printing preferences
                </p>
            </div>

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
                ) : Object.entries(groupedTemplates).map(([type, typeTemplates]) => (
                    <Card key={type}>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                {type === 'sales_invoice' || type === 'purchase_invoice' ? (
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
                                            </div>
                                        </div>

                                        {/* Features Toggles */}
                                        <div className="p-3 bg-muted/30 space-y-2">
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                                Display Options
                                            </p>
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                                                    // Only show toggles relevant to the template (if they exist in DB column)
                                                    // Assuming all columns exist on struct, we just iterate
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
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}


            </div>
        </div>
    );
}
