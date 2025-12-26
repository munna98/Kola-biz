import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, Supplier, CreateSupplier } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';

interface SupplierDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    supplierToEdit: Supplier | null;
    onSave: () => void;
}

export default function SupplierDialog({ open, onOpenChange, supplierToEdit, onSave }: SupplierDialogProps) {
    const [form, setForm] = useState<CreateSupplier>({ name: '', email: '', phone: '', address: '' });

    const orderedFields = ['name', 'email', 'phone', 'address'];
    const { register, handleKeyDown } = useDialog(open, onOpenChange, orderedFields);

    useEffect(() => {
        if (supplierToEdit) {
            setForm({
                name: supplierToEdit.name,
                email: supplierToEdit.email || '',
                phone: supplierToEdit.phone || '',
                address: supplierToEdit.address || '',
            });
        } else {
            setForm({ name: '', email: '', phone: '', address: '' });
        }
    }, [supplierToEdit, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (supplierToEdit) {
                await api.suppliers.update(supplierToEdit.id, form);
                toast.success('Supplier updated successfully');
            } else {
                await api.suppliers.create(form);
                toast.success('Supplier created successfully');
            }
            onSave();
            onOpenChange(false);
            setForm({ name: '', email: '', phone: '', address: '' });
        } catch (error) {
            toast.error(supplierToEdit ? 'Failed to update supplier' : 'Failed to create supplier');
            console.error(error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{supplierToEdit ? 'Edit' : 'Add'} Supplier</DialogTitle>
                    <DialogDescription>
                        {supplierToEdit ? 'Update the details of the existing supplier.' : 'Fill in the details to add a new supplier.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
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
                    <Button type="submit" className="w-full">{supplierToEdit ? 'Update' : 'Create'}</Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
