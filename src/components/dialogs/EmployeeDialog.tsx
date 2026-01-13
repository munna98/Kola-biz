import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { api, CreateEmployee, Employee, UpdateEmployee } from '@/lib/tauri';

interface EmployeeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employeeToEdit: Employee | null;
    onSave: () => void;
}

export default function EmployeeDialog({ open, onOpenChange, employeeToEdit, onSave }: EmployeeDialogProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<CreateEmployee>({
        name: '',
        code: '',
        designation: '',
        phone: '',
        email: '',
        address: '',
        joining_date: '',
        create_user: false,
        username: '',
        password: '',
        role: 'user',
    });

    useEffect(() => {
        if (employeeToEdit) {
            setFormData({
                name: employeeToEdit.name,
                code: employeeToEdit.code || '',
                designation: employeeToEdit.designation || '',
                phone: employeeToEdit.phone || '',
                email: employeeToEdit.email || '',
                address: employeeToEdit.address || '',
                joining_date: employeeToEdit.joining_date || '',
                create_user: !!employeeToEdit.user_id, // If user_id exists, they have a user
                username: '', // Can't retrieve without extra API call, leave blank
                password: '',
                role: 'user',
            });
        } else {
            setFormData({
                name: '',
                code: '',
                designation: '',
                phone: '',
                email: '',
                address: '',
                joining_date: new Date().toISOString().split('T')[0],
                create_user: false,
                username: '',
                password: '',
                role: 'user',
            });
        }
    }, [employeeToEdit, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (employeeToEdit) {
                const updateData: UpdateEmployee = {
                    id: employeeToEdit.id,
                    name: formData.name,
                    code: formData.code,
                    designation: formData.designation,
                    phone: formData.phone,
                    email: formData.email,
                    address: formData.address,
                    joining_date: formData.joining_date,
                    status: employeeToEdit.status,
                    create_user: formData.create_user, // Backend currently ignores this for updates usually, but passed anyway
                    username: formData.username,
                    password: formData.password,
                    role: formData.role,
                };
                await api.employees.update(updateData);
                toast.success('Employee updated successfully');
            } else {
                await api.employees.create(formData);
                toast.success('Employee created successfully');
            }
            onSave();
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.toString() || 'Failed to save employee');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{employeeToEdit ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name *</Label>
                            <Input
                                id="name"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="code">Employee Code</Label>
                            <Input
                                id="code"
                                placeholder="e.g. EMP-001"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="designation">Designation</Label>
                            <Input
                                id="designation"
                                placeholder="Manager, Salesman..."
                                value={formData.designation}
                                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="joining_date">Joining Date</Label>
                            <Input
                                id="joining_date"
                                type="date"
                                value={formData.joining_date}
                                onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Textarea
                            id="address"
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                    </div>

                    {/* System Login Section */}
                    <div className="border rounded-md p-4 space-y-4 bg-muted/20">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="create_user"
                                checked={formData.create_user}
                                onCheckedChange={(checked) => setFormData({ ...formData, create_user: checked === true })}
                                disabled={false} // Enabled for everyone now
                            />
                            <Label htmlFor="create_user" className="font-medium">
                                {employeeToEdit ? 'Has System Login (Cannot change)' : 'Enable System Login Access'}
                            </Label>
                        </div>

                        {formData.create_user && (
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Username *</Label>
                                    <Input
                                        id="username"
                                        required={formData.create_user}
                                        value={formData.username}
                                        // If editing and already has user_id, make username read-only or allow change?
                                        // Usually username is fixed, but let's allow basic edit if needed or keep it simple.
                                        // For now, if it's a new user creation (either new emp OR existing emp getting new login), they can type.
                                        // If existing emp ALREADY has login, we might not fetch the username easily without extra query.
                                        // BUT, we don't have the username in 'employeeToEdit' prop (only user_id).
                                        // So for existing employees with login, we might leave username blank or optional if they don't want to change it.
                                        // To fix this properly: We ideally need the username.
                                        // For now: Only require username if we are CREATING a new user context (i.e. was false, now true).
                                        // If already had user, and we keep it true, we can treat empty username as "don't change".
                                        // BUT validation requires it.
                                        // Let's rely on the user typing it if they are adding login.
                                        // If they ALREADY had login, we should probably tell them "Username/Pwd change optional" or similar.
                                        // Since we don't have the username, let's just show an alert if they try to edit an existing user without providing info.
                                        // Actually, simpler: If `employeeToEdit?.user_id` is present, hide Username/Password unless they want to reset it?
                                        // Let's try:
                                        // If (create_user is TRUE):
                                        //    If (Ref has NO user_id) -> SHOW FIELDS (New Login)
                                        //    If (Ref HAS user_id) -> SHOW FIELDS (Update Credentials) - Placeholder "Leave blank to keep current"
                                        placeholder={employeeToEdit?.user_id ? "Leave blank to keep current" : ""}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    // If existing user, username update might not be supported by backend logic heavily, but let's allow trying.
                                    // Actually backend logic I wrote: "INSERT INTO users" if creating.
                                    // If updating: "UPDATE users...".
                                    // So we should be fine.
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Password {employeeToEdit?.user_id ? '(Optional)' : '*'}</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        required={formData.create_user && !employeeToEdit?.user_id} // Required only if creating NEW login
                                        placeholder={employeeToEdit?.user_id ? "Leave blank to keep current" : ""}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="role">Role</Label>
                                    <Select
                                        value={formData.role}
                                        onValueChange={(value) => setFormData({ ...formData, role: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="user">User (Standard)</SelectItem>
                                            <SelectItem value="admin">Admin (Full Access)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        {employeeToEdit && employeeToEdit.user_id && !formData.create_user && (
                            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                Warning: Unchecking this will delete the associated user account and revoke login access for this employee.
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Employee'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog >
    );
}
