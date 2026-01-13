import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IconPlus, IconEdit, IconTrash, IconUser, IconMail, IconPhone } from '@tabler/icons-react';
import { api, Employee } from '@/lib/tauri';
import { toast } from 'sonner';
import EmployeeDialog from '@/components/dialogs/EmployeeDialog';

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [open, setOpen] = useState(false);
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const load = async () => {
        try {
            const data = await api.employees.list();
            setEmployees(data);
        } catch (error) {
            toast.error('Failed to load employees');
            console.error(error);
        }
    };

    useEffect(() => { load(); }, []);

    const handleEdit = (emp: Employee) => {
        setEmployeeToEdit(emp);
        setOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this employee?')) {
            try {
                await api.employees.delete(id);
                toast.success('Employee deleted successfully');
                load();
            } catch (error) {
                toast.error('Failed to delete employee');
                console.error(error);
            }
        }
    };

    const filteredEmployees = employees.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.designation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.phone || '').includes(searchTerm) ||
        (e.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Employees</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your staff credentials and HR details
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    <Input
                        placeholder="Search employees..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64"
                    />
                    <Button onClick={() => { setOpen(true); setEmployeeToEdit(null); }}>
                        <IconPlus size={16} /> Add Employee
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="border-b bg-muted/50">
                            <tr className="text-left text-sm">
                                <th className="p-3">Name</th>
                                <th className="p-3">Code</th>
                                <th className="p-3">Designation</th>
                                <th className="p-3">Contact</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                        {searchTerm ? 'No employees match your search.' : 'No employees found.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredEmployees.map(emp => (
                                    <tr key={emp.id} className="border-b hover:bg-muted/30">
                                        <td className="p-3 font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <IconUser size={16} />
                                                </div>
                                                <div>
                                                    <div>{emp.name}</div>
                                                    {emp.user_id && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Has Login</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 text-sm text-muted-foreground">{emp.code || '-'}</td>
                                        <td className="p-3 text-sm">{emp.designation || '-'}</td>
                                        <td className="p-3 text-sm">
                                            <div className="flex flex-col gap-1">
                                                {emp.phone && <div className="flex items-center gap-1"><IconPhone size={12} className="text-muted-foreground" /> {emp.phone}</div>}
                                                {emp.email && <div className="flex items-center gap-1"><IconMail size={12} className="text-muted-foreground" /> {emp.email}</div>}
                                                {!emp.phone && !emp.email && '-'}
                                            </div>
                                        </td>
                                        <td className="p-3 text-sm">
                                            <Badge variant={emp.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                                                {emp.status}
                                            </Badge>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="ghost" onClick={() => handleEdit(emp)}><IconEdit size={16} /></Button>
                                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(emp.id)}><IconTrash size={16} /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <EmployeeDialog
                open={open}
                onOpenChange={setOpen}
                employeeToEdit={employeeToEdit}
                onSave={load}
            />
        </div>
    );
}
