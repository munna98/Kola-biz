import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { api, ChartOfAccount, CreateChartOfAccount, AccountGroup, AccountGroupNode, buildAccountGroupTree, flattenGroupTree } from '@/lib/tauri';
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

/** Given a group name and the flat group list, walk up to find the root base_type */
function deriveAccountType(groupName: string, groups: AccountGroup[]): string {
    let current = groups.find(g => g.name === groupName);
    while (current) {
        if (current.base_type) return current.base_type;
        if (!current.parent_group_id) return current.account_type;
        current = groups.find(g => g.id === current!.parent_group_id);
    }
    return 'Asset';
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
        account_group: '',
        description: '',
        opening_balance: 0,
        opening_balance_type: 'Dr',
    });

    // Build hierarchical flat list for combobox
    const [flatGroupList, setFlatGroupList] = useState<AccountGroupNode[]>([]);
    useEffect(() => {
        if (accountGroups.length > 0) {
            const tree = buildAccountGroupTree(accountGroups);
            setFlatGroupList(flattenGroupTree(tree));
        }
    }, [accountGroups]);

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
                account_group: '',
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
            account_group: '',
            description: '',
            opening_balance: 0,
            opening_balance_type: 'Dr',
        });
    };

    const handleGroupChange = (groupName: string) => {
        const derivedType = deriveAccountType(groupName, accountGroups);
        setForm(f => ({ ...f, account_group: groupName, account_type: derivedType }));
        focusNext('group');
    };

    // Hierarchical options: indent by depth using non-breaking spaces
    // searchString is the actual group name for cmdk filtering
    const groupOptions = flatGroupList.map(node => ({
        value: node.name,
        label: '\u00A0'.repeat(node.depth * 3) + node.name,
        searchString: node.name, // cmdk filters by this
    }));

    const handleGroupChangeTyped = (v: string | number) => handleGroupChange(String(v));

    // Display the account type badge color
    const typeColor: Record<string, string> = {
        Asset: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        Liability: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        Equity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
        Income: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        Expense: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{accountToEdit ? 'Edit' : 'Add'} Account / Ledger</DialogTitle>
                    <DialogDescription>
                        {accountToEdit
                            ? 'Update the details of this ledger.'
                            : 'Create a new ledger under an account group.'}
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
                                disabled={accountToEdit?.is_system === 1}
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
                                disabled={accountToEdit?.is_system === 1}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Account Group</Label>
                            <Combobox
                                ref={register('group') as any}
                                options={groupOptions}
                                value={form.account_group}
                                onChange={handleGroupChangeTyped}
                                onKeyDown={(e) => handleSelectKeyDown(e, 'group')}
                                placeholder="Search or select group..."
                                className="w-full"
                                disabled={accountToEdit?.is_system === 1}
                            />
                        </div>
                        <div>
                            <Label>Account Type</Label>
                            <div className="mt-1.5 flex items-center h-9 px-3 rounded-md border bg-muted/40">
                                <span
                                    className={`px-2 py-0.5 rounded text-xs font-semibold ${typeColor[form.account_type] ?? 'bg-muted text-muted-foreground'}`}
                                >
                                    {form.account_type || '—'}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">
                                    (derived from group)
                                </span>
                            </div>
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
                            disabled={accountToEdit?.is_system === 1}
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
                                    <Label htmlFor="debit" className="font-normal cursor-pointer">Dr (Debit)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Cr" id="credit" />
                                    <Label htmlFor="credit" className="font-normal cursor-pointer">Cr (Credit)</Label>
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
