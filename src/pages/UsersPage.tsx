import { useEffect, useState } from 'react';
import {
    IconPlus,
    IconSearch,
    IconEdit,
    IconTrash,
    IconShieldLock,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { User, api } from '@/lib/tauri';
import UserDialog from '@/components/dialogs/UserDialog';
import { toast } from 'sonner';

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await api.users.list();
            setUsers(data);
        } catch (error) {
            toast.error('Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleEdit = (user: User) => {
        setSelectedUser(user);
        setDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }

        try {
            await api.users.delete(id);
            toast.success('User deleted successfully');
            fetchUsers();
        } catch (error) {
            toast.error(typeof error === 'string' ? error : 'Failed to delete user');
        }
    };

    const filteredUsers = users.filter((u) =>
        (u.username.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.fullName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.role.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
                    <p className="text-muted-foreground text-sm">
                        Manage system access, roles, and user accounts.
                    </p>
                </div>
                <Button onClick={() => { setSelectedUser(null); setDialogOpen(true); }}>
                    <IconPlus className="mr-2 h-4 w-4" /> Add User
                </Button>
            </div>

            <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
                <div className="relative flex-1 max-w-sm">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
            </div>

            <div className="border rounded-lg bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Full Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                    Loading users...
                                </TableCell>
                            </TableRow>
                        ) : filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredUsers.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <IconShieldLock size={16} className="text-muted-foreground" />
                                            {user.username}
                                        </div>
                                    </TableCell>
                                    <TableCell>{user.fullName || '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={user.isActive ? 'default' : 'destructive'} className="capitalize">
                                            {user.isActive ? 'Active' : 'Disabled'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleEdit(user)}
                                                title="Edit User"
                                            >
                                                <IconEdit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(user.id)}
                                                className="text-destructive hover:text-destructive"
                                                title="Delete User"
                                            >
                                                <IconTrash className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <UserDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                userToEdit={selectedUser}
                onSave={fetchUsers}
            />
        </div>
    );
}
