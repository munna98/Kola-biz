import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { User, UpdateUser, ResetPassword, api } from '@/lib/tauri';
import { toast } from 'sonner';

interface UserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userToEdit: User | null;
    onSave: () => void;
}

export default function UserDialog({ open, onOpenChange, userToEdit, onSave }: UserDialogProps) {
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [role, setRole] = useState('user');
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (userToEdit) {
            setUsername(userToEdit.username);
            setFullName(userToEdit.fullName || '');
            setRole(userToEdit.role);
            setIsActive(userToEdit.isActive);
            setPassword(''); // Don't show password on edit
        } else {
            setUsername('');
            setPassword('');
            setFullName('');
            setRole('user');
            setIsActive(true);
        }
    }, [userToEdit, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (userToEdit) {
                const updateData: UpdateUser = {
                    id: userToEdit.id,
                    fullName: fullName,
                    role,
                    isActive: isActive,
                };
                await api.users.update(updateData);

                // If password is not empty, reset it
                if (password.trim()) {
                    const resetData: ResetPassword = {
                        id: userToEdit.id,
                        password,
                    };
                    await api.users.resetPassword(resetData);
                }

                toast.success('User updated successfully');
            } else {
                await api.users.create({
                    username,
                    password,
                    full_name: fullName,
                    role,
                });
                toast.success('User created successfully');
            }
            onSave();
            onOpenChange(false);
        } catch (error) {
            toast.error(typeof error === 'string' ? error : 'Failed to save user');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{userToEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="username">Username *</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={!!userToEdit || loading}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                            id="fullName"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">
                            {userToEdit ? 'New Password (leave blank to keep current)' : 'Password *'}
                        </Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            required={!userToEdit}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Select value={role} onValueChange={setRole} disabled={loading}>
                                <SelectTrigger id="role">
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="operator">Operator</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center space-x-2 pt-8">
                            <Switch
                                id="active"
                                checked={isActive}
                                onCheckedChange={setIsActive}
                                disabled={loading}
                            />
                            <Label htmlFor="active">Active</Label>
                        </div>
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : 'Save User'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
