import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, Customer, CreateCustomer } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';

interface CustomerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerToEdit: Customer | null;
    onSave: (customer?: Customer) => void;
    initialName?: string;
}

export default function CustomerDialog({ open, onOpenChange, customerToEdit, onSave, initialName = '' }: CustomerDialogProps) {
    const [form, setForm] = useState<CreateCustomer>({ code: '', name: '', email: '', phone: '', address: '' });

    const orderedFields = ['code', 'name', 'email', 'phone', 'address'];
    const { register, handleKeyDown } = useDialog(open, onOpenChange, orderedFields);

    useEffect(() => {
        if (customerToEdit) {
            setForm({
                code: customerToEdit.code,
                name: customerToEdit.name,
                email: customerToEdit.email || '',
                phone: customerToEdit.phone || '',
                address: customerToEdit.address || '',
            });
        } else {
            setForm({ code: '', name: initialName, email: '', phone: '', address: '' });
            api.customers.getNextCode().then(code => setForm(prev => ({ ...prev, code }))).catch(console.error);
        }
    }, [customerToEdit, open, initialName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let result: Customer | undefined;
            if (customerToEdit) {
                // update doesn't return the object, so we might not be able to pass it back directly if API doesn't return it.
                // But for editing, we might not need to auto-select (it's already selected).
                await api.customers.update(customerToEdit.id, form);
                toast.success('Customer updated successfully');
                // For completeness, we could construct it, but it's less critical for edit.
                onOpenChange(false);
            } else {
                result = await api.customers.create(form);
                toast.success('Customer created successfully');
                setForm({ code: '', name: '', email: '', phone: '', address: '' });
            }
            onSave(result);
        } catch (error) {
            toast.error(customerToEdit ? 'Failed to update customer' : 'Failed to create customer');
            console.error(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{customerToEdit ? 'Edit' : 'Add'} Customer</DialogTitle>
                    <DialogDescription>
                        {customerToEdit ? 'Update the details of the existing customer.' : 'Fill in the details to add a new customer to your database.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Code</Label>
                            <Input
                                ref={register('code') as any}
                                value={form.code}
                                onChange={e => setForm({ ...form, code: e.target.value })}
                                onKeyDown={(e) => handleKeyDown(e, 'code')}
                                placeholder="Auto-generated"
                            />
                        </div>
                        <div>
                            <Label>Name *</Label>
                            <Input
                                ref={register('name') as any}
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                onKeyDown={(e) => handleKeyDown(e, 'name')}
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Email</Label>
                        <Input
                            ref={register('email') as any}
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, 'email')}
                        />
                    </div>
                    <div>
                        <Label>Phone</Label>
                        <Input
                            ref={register('phone') as any}
                            value={form.phone}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, 'phone')}
                        />
                    </div>
                    <div>
                        <Label>Address</Label>
                        <Input
                            ref={register('address') as any}
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, 'address')}
                        />
                    </div>
                    <Button type="submit" className="w-full">{customerToEdit ? 'Update' : 'Create'}</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
