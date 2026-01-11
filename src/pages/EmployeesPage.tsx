import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { IconPlus, IconEdit, IconTrash, IconUser, IconId, IconBriefcase, IconMail, IconPhone } from '@tabler/icons-react';
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
        (e.designation || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 space-y-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEmployees.map(emp => (
                    <Card key={emp.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6 space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="flex gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                        <IconUser size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{emp.name}</h3>
                                        {emp.designation && <p className="text-sm text-muted-foreground flex items-center gap-1"><IconBriefcase size={12} /> {emp.designation}</p>}
                                        {emp.code && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><IconId size={12} /> {emp.code}</p>}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(emp)}>
                                        <IconEdit size={16} />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(emp.id)}>
                                        <IconTrash size={16} />
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-2 space-y-2 text-sm">
                                {emp.phone && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <IconPhone size={14} />
                                        <span>{emp.phone}</span>
                                    </div>
                                )}
                                {emp.email && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <IconMail size={14} />
                                        <span>{emp.email}</span>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 flex items-center justify-between border-t mt-2">
                                <div className={`text-xs px-2 py-1 rounded-full ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                    {emp.status}
                                </div>
                                {emp.user_id && (
                                    <div className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                                        Has Login
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {filteredEmployees.length === 0 && (
                    <div className="col-span-full text-center py-10 text-muted-foreground">
                        No employees found.
                    </div>
                )}
            </div>

            <EmployeeDialog
                open={open}
                onOpenChange={setOpen}
                employeeToEdit={employeeToEdit}
                onSave={load}
            />
        </div>
    );
}
