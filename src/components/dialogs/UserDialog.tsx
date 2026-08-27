import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, UpdateUser, ResetPassword, api, UserRole, Permission, RolePermissions } from "@/lib/tauri";
import { toast } from "sonner";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import { ALL_MENU_ITEMS } from "@/lib/menu-items";

interface UserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userToEdit: User | null;
    onSave: () => void;
    defaultTab?: "profile" | "rights";
}

const ACTION_COLS: { key: keyof Permission; label: string }[] = [
    { key: "view", label: "View" },
    { key: "create", label: "Create" },
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete" },
    { key: "void", label: "Void" },
    { key: "print", label: "Print" },
];

const SETTINGS_PAGES = new Set(["users","roles","company_profile","invoice_settings","voucher_settings","voucher_sequences","license","barcode_settings","db_settings","sidebar_settings","feature_settings","product_settings","tax_settings","invoice_designer"]);

export default function UserDialog({ open, onOpenChange, userToEdit, onSave, defaultTab = "profile" }: UserDialogProps) {
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [role, setRole] = useState("operator");
    const [isActive, setIsActive] = useState(true);

    const [roles, setRoles] = useState<UserRole[]>([]);
    const [selectedRoleId, setSelectedRoleId] = useState("role_operator");
    const [basePermissions, setBasePermissions] = useState<RolePermissions>({});
    const [overrides, setOverrides] = useState<Record<string, Partial<Permission>>>({});
    const [rightsLoading, setRightsLoading] = useState(false);

    useEffect(() => {
        if (open) loadRoles();
    }, [open]);

    useEffect(() => {
        if (userToEdit) {
            setUsername(userToEdit.username);
            setFullName(userToEdit.fullName || "");
            setRole(userToEdit.role);
            setIsActive(userToEdit.isActive);
            setPassword("");
            loadUserPermissions(userToEdit.id);
        } else {
            setUsername(""); setPassword(""); setFullName(""); setRole("operator"); setIsActive(true);
            setOverrides({}); setSelectedRoleId("role_operator");
        }
    }, [userToEdit, open]);

    useEffect(() => {
        const found = roles.find(r => r.id === selectedRoleId);
        if (found) { try { setBasePermissions(JSON.parse(found.permissions)); } catch { setBasePermissions({}); } }
    }, [selectedRoleId, roles]);

    const loadRoles = async () => {
        try { const data = await api.roles.list(); setRoles(data); } catch {}
    };

    const loadUserPermissions = async (userId: string) => {
        setRightsLoading(true);
        try {
            const result = await api.permissions.getForUser(userId);
            setSelectedRoleId(result.roleId);
            try { setBasePermissions(JSON.parse(result.permissions)); } catch { setBasePermissions({}); }
            try { setOverrides(JSON.parse(result.overrides)); } catch { setOverrides({}); }
        } catch {} finally { setRightsLoading(false); }
    };

    const effectivePerm = (pageId: string, action: keyof Permission): boolean => {
        const ov = overrides[pageId];
        if (ov && action in ov) return !!ov[action];
        return !!(basePermissions[pageId]?.[action]);
    };

    const toggleOverride = (pageId: string, action: keyof Permission) => {
        const current = effectivePerm(pageId, action);
        const newVal = !current;
        const base = !!(basePermissions[pageId]?.[action]);
        setOverrides(prev => {
            const updated = { ...prev };
            const pageOv = { ...(updated[pageId] ?? {}) };
            if (newVal === base) { delete pageOv[action]; } else { pageOv[action] = newVal; }
            if (Object.keys(pageOv).length === 0) { delete updated[pageId]; } else { updated[pageId] = pageOv; }
            return updated;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (userToEdit) {
                await api.users.update({ id: userToEdit.id, fullName, role, isActive } as UpdateUser);
                if (password.trim()) await api.users.resetPassword({ id: userToEdit.id, password } as ResetPassword);
                await api.permissions.saveForUser({ userId: userToEdit.id, roleId: selectedRoleId, overrides: JSON.stringify(overrides) });
                toast.success("User updated successfully");
            } else {
                await api.users.create({ username, password, full_name: fullName, role });
                toast.success("User created successfully");
            }
            onSave();
            onOpenChange(false);
        } catch (error) {
            toast.error(typeof error === "string" ? error : "Failed to save user");
        } finally { setLoading(false); }
    };

    const allPages = ALL_MENU_ITEMS.filter(item => !SETTINGS_PAGES.has(item.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{userToEdit ? "Edit User" : "Add New User"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <Tabs defaultValue={defaultTab} className="flex flex-col flex-1 min-h-0">
                        <TabsList className="shrink-0">
                            <TabsTrigger value="profile">Profile</TabsTrigger>
                            {userToEdit && <TabsTrigger value="rights">Role & Rights</TabsTrigger>}
                        </TabsList>

                        <TabsContent value="profile" className="space-y-4 py-4 overflow-y-auto">
                            <div className="space-y-2">
                                <Label htmlFor="username">Username *</Label>
                                <Input id="username" value={username} onChange={e => setUsername(e.target.value)} disabled={!!userToEdit || loading} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Full Name</Label>
                                <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} disabled={loading} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">{userToEdit ? "New Password (leave blank to keep current)" : "Password *"}</Label>
                                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} required={!userToEdit} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="role">Role</Label>
                                    <Select value={role} onValueChange={setRole} disabled={loading}>
                                        <SelectTrigger id="role"><SelectValue placeholder="Select role" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="manager">Manager</SelectItem>
                                            <SelectItem value="sales_staff">Sales Staff</SelectItem>
                                            <SelectItem value="accountant">Accountant</SelectItem>
                                            <SelectItem value="operator">Operator</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center space-x-2 pt-8">
                                    <Switch id="active" checked={isActive} onCheckedChange={setIsActive} disabled={loading} />
                                    <Label htmlFor="active">Active</Label>
                                </div>
                            </div>
                        </TabsContent>

                        {userToEdit && (
                            <TabsContent value="rights" className="flex flex-col flex-1 min-h-0 py-2">
                                {rightsLoading ? (
                                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">Loading permissions...</div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3 mb-3 shrink-0">
                                            <Label className="shrink-0 font-semibold">Base Role</Label>
                                            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                                                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <span className="text-xs text-muted-foreground">Solid = allowed. Click to override individually.</span>
                                        </div>
                                        <div className="overflow-y-auto flex-1 border rounded-lg">
                                            <table className="w-full text-xs">
                                                <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                                                    <tr>
                                                        <th className="text-left px-3 py-2 font-semibold">Page</th>
                                                        {ACTION_COLS.map(c => <th key={c.key} className="px-2 py-2 font-semibold text-center w-14">{c.label}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {allPages.map((item, idx) => (
                                                        <tr key={item.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                                                            <td className="px-3 py-1.5 font-medium">{item.label}</td>
                                                            {ACTION_COLS.map(c => {
                                                                const effective = effectivePerm(item.id, c.key);
                                                                const hasOverride = !!(overrides[item.id] && c.key in (overrides[item.id] ?? {}));
                                                                return (
                                                                    <td key={c.key} className="px-2 py-1.5 text-center">
                                                                        <button type="button" onClick={() => toggleOverride(item.id, c.key)}
                                                                            className={effective
                                                                                ? hasOverride ? "w-5 h-5 mx-auto rounded flex items-center justify-center bg-primary text-primary-foreground" : "w-5 h-5 mx-auto rounded flex items-center justify-center bg-primary/30 text-primary"
                                                                                : hasOverride ? "w-5 h-5 mx-auto rounded flex items-center justify-center bg-destructive/20 text-destructive" : "w-5 h-5 mx-auto rounded flex items-center justify-center border border-muted-foreground/20 text-muted-foreground/30"}
                                                                            title={effective ? (hasOverride ? "Allowed (override)" : "Allowed (role)") : (hasOverride ? "Denied (override)" : "Denied (role)")}>
                                                                            {effective ? <IconCheck size={11} /> : <IconMinus size={11} />}
                                                                        </button>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </TabsContent>
                        )}
                    </Tabs>
                    <DialogFooter className="pt-4 shrink-0">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save User"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
