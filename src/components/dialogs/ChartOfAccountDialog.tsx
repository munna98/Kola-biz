import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { api, ChartOfAccount, CreateChartOfAccount, AccountGroup } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';
import { Combobox } from '@/components/ui/combobox';

interface ChartOfAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accountToEdit: ChartOfAccount | null;
    onSave: (account?: ChartOfAccount) => void;
    accountGroups: AccountGroup[];
    initialName?: string;
}

export default function ChartOfAccountDialog({
    open,
    onOpenChange,
    accountToEdit,
    onSave,
    accountGroups,
    initialName = ''
}: ChartOfAccountDialogProps) {
    const [form, setForm] = useState<CreateChartOfAccount>({
        account_code: '',
        account_name: '',
        account_type: 'Asset',
        account_group: 'Current Assets',
        description: '',
        opening_balance: 0,
        opening_balance_type: 'Dr',
    });

    const orderedFields = ['code', 'name', 'group', 'description', 'balance', 'balanceType'];
    const { register, handleKeyDown, handleSelectKeyDown, focusNext, parseNumber, formatNumber } = useDialog(
        open,
        onOpenChange,
        orderedFields
    );

    useEffect(() => {
        if (accountToEdit) {
            setForm({
                account_code: accountToEdit.account_code,
                account_name: accountToEdit.account_name,
                account_type: accountToEdit.account_type,
                account_group: accountToEdit.account_group,
                description: accountToEdit.description,
                opening_balance: accountToEdit.opening_balance,
                opening_balance_type: accountToEdit.opening_balance_type || 'Dr',
            });
        } else {
            setForm({
                account_code: '',
                account_name: initialName,
                account_type: 'Asset',
                account_group: 'Current Assets',
                description: '',
                opening_balance: 0,
                opening_balance_type: 'Dr',
            });
        }
    }, [accountToEdit, open, initialName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let result: ChartOfAccount | undefined;
            if (accountToEdit) {
                await api.chartOfAccounts.update(accountToEdit.id, form);
                toast.success('Account updated successfully');
            } else {
                result = await api.chartOfAccounts.create(form);
                toast.success('Account created successfully');
            }
            onSave(result);
            onOpenChange(false);
            resetForm();
        } catch (error) {
            toast.error(accountToEdit ? 'Failed to update account' : 'Failed to create account');
            console.error(error);
        }
    };

    const resetForm = () => {
        setForm({
            account_code: '',
            account_name: '',
            account_type: 'Asset',
            account_group: 'Current Assets',
            description: '',
            opening_balance: 0,
            opening_balance_type: 'Dr',
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{accountToEdit ? 'Edit' : 'Add'} Account</DialogTitle>
                    <DialogDescription>
                        {accountToEdit ? 'Update the details of the existing account in your chart of accounts.' : 'Fill in the details to create a new account in your chart of accounts.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Account Code</Label>
                            <Input
                                ref={register('code') as any}
                                value={form.account_code}
                                onChange={e => setForm({ ...form, account_code: e.target.value })}
                                onKeyDown={(e) => handleKeyDown(e, 'code')}
                                required
                            />
                        </div>
                        <div>
                            <Label>Account Name</Label>
                            <Input
                                ref={register('name') as any}
                                value={form.account_name}
                                onChange={e => setForm({ ...form, account_name: e.target.value })}
                                onKeyDown={(e) => handleKeyDown(e, 'name')}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Account Group</Label>
                            <Combobox
                                ref={register('group') as any}
                                options={accountGroups.map(g => ({ value: g.name, label: g.name }))}
                                value={form.account_group}
                                onChange={v => {
                                    const selectedGroup = accountGroups.find(g => g.name === v);
                                    setForm({
                                        ...form,
                                        account_group: String(v),
                                        account_type: selectedGroup ? selectedGroup.account_type : form.account_type
                                    });
                                    focusNext('group');
                                }}
                                onKeyDown={(e) => handleSelectKeyDown(e, 'group')}
                                placeholder="Search group..."
                                className="w-full"
                            />
                        </div>
                        <div>
                            <Label>Account Type</Label>
                            <Input
                                value={form.account_type}
                                readOnly
                                className="bg-muted text-muted-foreground"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Description</Label>
                        <Input
                            ref={register('description') as any}
                            value={form.description || ''}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, 'description')}
                            placeholder="Optional description"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Opening Balance</Label>
                            <Input
                                ref={register('balance') as any}
                                type="number"
                                step="0.01"
                                value={formatNumber(form.opening_balance)}
                                onChange={e => setForm({ ...form, opening_balance: parseNumber(e.target.value) })}
                                onKeyDown={(e) => handleKeyDown(e, 'balance')}
                            />
                        </div>

                        <div>
                            <Label>Balance Type</Label>
                            <RadioGroup
                                value={form.opening_balance_type || 'Dr'}
                                onValueChange={(value) => setForm({ ...form, opening_balance_type: value as 'Dr' | 'Cr' })}
                                className="flex gap-4 mt-2"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem
                                        value="Dr"
                                        id="debit"
                                        ref={register('balanceType') as any}
                                        onKeyDown={(e) => handleKeyDown(e, 'balanceType')}
                                    />
                                    <Label htmlFor="debit" className="font-normal cursor-pointer">Dr</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Cr" id="credit" />
                                    <Label htmlFor="credit" className="font-normal cursor-pointer">Cr</Label>
                                </div>
                            </RadioGroup>
                        </div>
                    </div>

                    <Button type="submit" className="w-full">
                        {accountToEdit ? 'Update' : 'Create'} Account
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
