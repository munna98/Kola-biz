import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, Customer, CreateCustomer } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';
import { RootState } from '@/store';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

interface Country { id: string; name: string; code: string; }
interface Currency { id: string; code: string; name: string; symbol?: string; country?: string; }

const EMPTY_FORM: CreateCustomer = {
  code: '', name: '', email: '', phone: '',
  address_line_1: '', address_line_2: '', address_line_3: '',
  city: '', state: '', postal_code: '', country: '', gstin: '', currency: '',
};

interface CustomerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerToEdit: Customer | null;
    onSave: (customer?: Customer) => void;
    initialName?: string;
}

export default function CustomerDialog({ open, onOpenChange, customerToEdit, onSave, initialName = '' }: CustomerDialogProps) {
    const [form, setForm] = useState<CreateCustomer>(EMPTY_FORM);
    const [countries, setCountries] = useState<Country[]>([]);
    const [currencies, setCurrencies] = useState<Currency[]>([]);

    const profile = useSelector((state: RootState) => state.companyProfile.profile);
    const isExportBusiness = profile.business_type === 'Export Business';

    const orderedFields = isExportBusiness
        ? ['code', 'name', 'email', 'phone', 'gstin', 'addr1', 'addr2', 'addr3', 'city', 'state', 'postal', 'country', 'currency']
        : ['code', 'name', 'email', 'phone', 'gstin', 'addr1', 'addr2', 'addr3', 'city', 'state', 'postal'];
    const { register, handleKeyDown, handleSelectKeyDown } = useDialog(open, onOpenChange, orderedFields);

    // Fetch countries & currencies once when dialog opens
    useEffect(() => {
        if (!open) return;
        invoke<Country[]>('get_countries').then(setCountries).catch(console.error);
        invoke<Currency[]>('get_currencies').then(setCurrencies).catch(console.error);
    }, [open]);

    // Populate form when editing or creating
    useEffect(() => {
        if (!open) return;
        if (customerToEdit) {
            setForm({
                code: customerToEdit.code,
                name: customerToEdit.name,
                email: customerToEdit.email || '',
                phone: customerToEdit.phone || '',
                address_line_1: customerToEdit.address_line_1 || '',
                address_line_2: customerToEdit.address_line_2 || '',
                address_line_3: customerToEdit.address_line_3 || '',
                city: customerToEdit.city || '',
                state: customerToEdit.state || '',
                postal_code: customerToEdit.postal_code || '',
                country: customerToEdit.country || '',
                gstin: customerToEdit.gstin || '',
                currency: customerToEdit.currency || '',
            });
        } else {
            setForm({ ...EMPTY_FORM, name: initialName });
            api.customers.getNextCode().then(code => setForm(prev => ({ ...prev, code }))).catch(console.error);
        }
    }, [customerToEdit, open, initialName]);

    // Apply defaults for new customers once lists are loaded
    useEffect(() => {
        if (customerToEdit || !open) return;
        if (countries.length > 0 && !form.country) {
            const india = countries.find(c => c.name === 'India');
            if (india) setForm(prev => ({ ...prev, country: india.id }));
        }
        if (currencies.length > 0 && !form.currency) {
            const defaultCode = profile.base_currency || 'INR';
            const baseCurr = currencies.find(c => c.code === defaultCode);
            if (baseCurr) setForm(prev => ({ ...prev, currency: baseCurr.id }));
        }
    }, [countries, currencies, customerToEdit, open]);

    const countryOptions = countries.map(c => ({ value: c.id, label: c.name, searchString: `${c.name} ${c.code}` }));
    const currencyOptions = currencies.map(c => ({ value: c.id, label: `${c.code} — ${c.name}`, searchString: `${c.code} ${c.name}` }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let result: Customer | undefined;
            if (customerToEdit) {
                await api.customers.update(customerToEdit.id, form);
                toast.success('Customer updated successfully');
                onOpenChange(false);
            } else {
                result = await api.customers.create(form);
                toast.success('Customer created successfully');
                setForm(EMPTY_FORM);
            }
            onSave(result);
        } catch (error) {
            toast.error(customerToEdit ? 'Failed to update customer' : 'Failed to create customer');
            console.error(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{customerToEdit ? 'Edit' : 'Add'} Customer</DialogTitle>
                    <DialogDescription>
                        {customerToEdit ? 'Update the details of the existing customer.' : 'Fill in the details to add a new customer.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-medium">Code</Label>
                            <Input ref={register('code') as any} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} onKeyDown={e => handleKeyDown(e, 'code')} placeholder="Auto-generated" className="h-8 text-sm mt-1" />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Name *</Label>
                            <Input ref={register('name') as any} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={e => handleKeyDown(e, 'name')} required className="h-8 text-sm mt-1" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-medium">Email</Label>
                            <Input ref={register('email') as any} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} onKeyDown={e => handleKeyDown(e, 'email')} className="h-8 text-sm mt-1" />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Phone</Label>
                            <Input ref={register('phone') as any} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} onKeyDown={e => handleKeyDown(e, 'phone')} className="h-8 text-sm mt-1" />
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs font-medium">GSTIN</Label>
                        <Input ref={register('gstin') as any} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} onKeyDown={e => handleKeyDown(e, 'gstin')} placeholder="22AAAAA0000A1Z5" className="h-8 text-sm mt-1 font-mono" maxLength={15} />
                    </div>

                    <div className="space-y-2">
                        <Input ref={register('addr1') as any} value={form.address_line_1} onChange={e => setForm({ ...form, address_line_1: e.target.value })} onKeyDown={e => handleKeyDown(e, 'addr1')} placeholder="Address Line 1" className="h-8 text-sm" />
                        <Input ref={register('addr2') as any} value={form.address_line_2} onChange={e => setForm({ ...form, address_line_2: e.target.value })} onKeyDown={e => handleKeyDown(e, 'addr2')} placeholder="Address Line 2" className="h-8 text-sm" />
                        <Input ref={register('addr3') as any} value={form.address_line_3} onChange={e => setForm({ ...form, address_line_3: e.target.value })} onKeyDown={e => handleKeyDown(e, 'addr3')} placeholder="Address Line 3" className="h-8 text-sm" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label className="text-xs font-medium">City</Label>
                            <Input ref={register('city') as any} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} onKeyDown={e => handleKeyDown(e, 'city')} className="h-8 text-sm mt-1" />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">State</Label>
                            <Select value={form.state || ''} onValueChange={v => setForm({ ...form, state: v })}>
                                <SelectTrigger ref={register('state') as any} className="h-8 text-sm mt-1" onKeyDown={e => handleSelectKeyDown(e, 'state')}>
                                    <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                    {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Postal Code</Label>
                            <Input ref={register('postal') as any} value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} onKeyDown={e => handleKeyDown(e, 'postal')} className="h-8 text-sm mt-1" maxLength={6} />
                        </div>
                    </div>

                    {/* Country & Currency — Export Business only */}
                    {isExportBusiness && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs font-medium">Country</Label>
                                <Combobox
                                    ref={register('country') as any}
                                    options={countryOptions}
                                    value={form.country || ''}
                                    onChange={v => setForm({ ...form, country: String(v) })}
                                    placeholder="Select country"
                                    searchPlaceholder="Search country..."
                                    className="h-8 text-sm mt-1 w-full"
                                    onKeyDown={e => handleKeyDown(e, 'country')}
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-medium">Currency</Label>
                                <Combobox
                                    ref={register('currency') as any}
                                    options={currencyOptions}
                                    value={form.currency || ''}
                                    onChange={v => setForm({ ...form, currency: String(v) })}
                                    placeholder="Select currency"
                                    searchPlaceholder="Search currency..."
                                    className="h-8 text-sm mt-1 w-full"
                                    onKeyDown={e => handleKeyDown(e, 'currency')}
                                />
                            </div>
                        </div>
                    )}

                    <Button type="submit" className="w-full">{customerToEdit ? 'Update' : 'Create'}</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
