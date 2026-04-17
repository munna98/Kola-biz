import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { api, Customer, CreateCustomer } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const EMPTY_FORM: CreateCustomer = {
  code: '', name: '', email: '', phone: '',
  address_line_1: '', address_line_2: '', address_line_3: '',
  city: '', state: '', postal_code: '', country: 'India', gstin: '',
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

    const orderedFields = ['code', 'name', 'email', 'phone', 'gstin', 'addr1', 'addr2', 'addr3', 'city', 'state', 'postal'];
    const { register, handleKeyDown, handleSelectKeyDown } = useDialog(open, onOpenChange, orderedFields);

    useEffect(() => {
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
                country: customerToEdit.country || 'India',
                gstin: customerToEdit.gstin || '',
            });
        } else {
            setForm({ ...EMPTY_FORM, name: initialName });
            api.customers.getNextCode().then(code => setForm(prev => ({ ...prev, code }))).catch(console.error);
        }
    }, [customerToEdit, open, initialName]);

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
                    {/* Basic info */}
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

                    <Separator />

                    {/* GST */}
                    <div>
                        <Label className="text-xs font-medium">GSTIN</Label>
                        <Input ref={register('gstin') as any} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} onKeyDown={e => handleKeyDown(e, 'gstin')} placeholder="22AAAAA0000A1Z5" className="h-8 text-sm mt-1 font-mono" maxLength={15} />
                    </div>

                    <Separator />

                    {/* Address */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</p>
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

                    <Button type="submit" className="w-full">{customerToEdit ? 'Update' : 'Create'}</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
