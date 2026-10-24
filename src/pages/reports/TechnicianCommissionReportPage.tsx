import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { IconUserCheck } from '@tabler/icons-react';
import { useMoney } from '@/hooks/useMoney';

interface TechnicianCommissionRow {
    employee_id: string;
    employee_name: string;
    completed_orders: number;
    total_labour_revenue: number;
    total_parts_billed: number;
    total_service_revenue: number;
    total_commission_earned: number;
}

export default function TechnicianCommissionReportPage() {
    const money = useMoney();

    const [reportRows, setReportRows] = useState<TechnicianCommissionRow[]>([]);
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedTech, setSelectedTech] = useState<string>('all');
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');

    const loadEmployees = async () => {
        try {
            const emps = await invoke<any[]>('get_employees').catch(() => []);
            setEmployees((emps || []).map(e => ({ id: e.id, name: e.name })));
        } catch (e) {
            console.error(e);
        }
    };

    const loadReport = async () => {
        try {
            setLoading(true);
            const data = await invoke<TechnicianCommissionRow[]>('get_technician_commission_report', {
                technicianId: selectedTech === 'all' ? null : selectedTech,
                fromDate: fromDate || null,
                toDate: toDate || null,
            });
            setReportRows(data || []);
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to load technician commission report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEmployees();
    }, []);

    useEffect(() => {
        loadReport();
    }, [selectedTech, fromDate, toDate]);

    // Summary totals
    const totals = reportRows.reduce(
        (acc, r) => {
            acc.orders += Number(r.completed_orders);
            acc.labour += r.total_labour_revenue;
            acc.parts += r.total_parts_billed;
            acc.revenue += r.total_service_revenue;
            acc.commission += r.total_commission_earned;
            return acc;
        },
        { orders: 0, labour: 0, parts: 0, revenue: 0, commission: 0 }
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-card shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <IconUserCheck size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Technician Commission Report</h1>
                        <p className="text-xs text-muted-foreground">Performance & commission payouts for repair technicians</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 text-xs">
                    <div className="w-48">
                        <Select value={selectedTech} onValueChange={setSelectedTech}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="All Technicians" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Technicians</SelectItem>
                                {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Input
                            type="date"
                            className="h-8 text-xs w-36"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                            type="date"
                            className="h-8 text-xs w-36"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* KPI Metric Summary */}
            <div className="grid grid-cols-5 gap-4 px-6 py-3 border-b bg-muted/20 shrink-0">
                <Card className="shadow-none border">
                    <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground font-medium">Completed Jobs</p>
                        <p className="text-lg font-bold">{totals.orders}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-none border">
                    <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground font-medium">Labour Revenue</p>
                        <p className="text-lg font-bold font-mono text-foreground">{money(totals.labour)}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-none border">
                    <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground font-medium">Parts Billed</p>
                        <p className="text-lg font-bold font-mono text-foreground">{money(totals.parts)}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-none border">
                    <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground font-medium">Total Service Revenue</p>
                        <p className="text-lg font-bold font-mono text-foreground">{money(totals.revenue)}</p>
                    </CardContent>
                </Card>

                <Card className="shadow-none border bg-primary/5 border-primary/20">
                    <CardContent className="p-3">
                        <p className="text-[11px] text-primary font-semibold">Total Commission Payable</p>
                        <p className="text-lg font-bold font-mono text-primary">{money(totals.commission)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Table */}
            <div className="flex-1 overflow-auto p-6">
                <Card className="shadow-none border overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b bg-muted/50 font-medium text-muted-foreground">
                                <th className="p-3">Technician</th>
                                <th className="p-3 text-center">Completed Repairs</th>
                                <th className="p-3 text-right">Labour Revenue</th>
                                <th className="p-3 text-right">Parts Billed</th>
                                <th className="p-3 text-right">Total Revenue Brought In</th>
                                <th className="p-3 text-right">Commission Earned</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                        Loading technician report...
                                    </td>
                                </tr>
                            ) : reportRows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                                        <IconUserCheck size={32} className="mx-auto mb-2 opacity-40" />
                                        <p className="font-medium">No completed orders found for the selected period.</p>
                                    </td>
                                </tr>
                            ) : (
                                reportRows.map(r => (
                                    <tr key={r.employee_id} className="hover:bg-muted/30">
                                        <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                                {r.employee_name.charAt(0)}
                                            </div>
                                            {r.employee_name}
                                        </td>
                                        <td className="p-3 text-center font-mono font-medium">{r.completed_orders}</td>
                                        <td className="p-3 text-right font-mono">{money(r.total_labour_revenue)}</td>
                                        <td className="p-3 text-right font-mono">{money(r.total_parts_billed)}</td>
                                        <td className="p-3 text-right font-mono font-medium">{money(r.total_service_revenue)}</td>
                                        <td className="p-3 text-right font-mono font-bold text-primary">{money(r.total_commission_earned)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {reportRows.length > 0 && (
                            <tfoot className="border-t bg-muted/30 font-bold">
                                <tr>
                                    <td className="p-3">Total:</td>
                                    <td className="p-3 text-center font-mono">{totals.orders}</td>
                                    <td className="p-3 text-right font-mono">{money(totals.labour)}</td>
                                    <td className="p-3 text-right font-mono">{money(totals.parts)}</td>
                                    <td className="p-3 text-right font-mono">{money(totals.revenue)}</td>
                                    <td className="p-3 text-right font-mono text-primary">{money(totals.commission)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </Card>
            </div>
        </div>
    );
}
