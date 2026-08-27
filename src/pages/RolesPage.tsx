import { useEffect, useState } from "react";
import { IconPlus, IconEdit, IconTrash, IconShieldLock, IconCheck, IconMinus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, UserRole, Permission, RolePermissions } from "@/lib/tauri";
import { ALL_MENU_ITEMS } from "@/lib/menu-items";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

const ACTION_COLS: { key: keyof Permission; label: string }[] = [
    { key: "view", label: "View" },
    { key: "create", label: "Create" },
    { key: "edit", label: "Edit" },
    { key: "delete", label: "Delete" },
    { key: "void", label: "Void" },
    { key: "print", label: "Print" },
];

const SETTINGS_PAGES = new Set(["users","roles","company_profile","invoice_settings","voucher_settings","voucher_sequences","license","barcode_settings","db_settings","sidebar_settings","feature_settings","product_settings","tax_settings","invoice_designer"]);
const ALL_PAGES = ALL_MENU_ITEMS.filter(item => !SETTINGS_PAGES.has(item.id));

const ALL_FALSE_PERMS: RolePermissions = {};
for (const item of ALL_PAGES) {
    ALL_FALSE_PERMS[item.id] = { view: false, create: false, edit: false, delete: false, void: false, print: false };
}

interface RoleEditorDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    roleToEdit: UserRole | null;
    onSave: () => void;
}

function RoleEditorDialog({ open, onOpenChange, roleToEdit, onSave }: RoleEditorDialogProps) {
    const [name, setName] = useState("");
    const [permissions, setPermissions] = useState<RolePermissions>({ ...ALL_FALSE_PERMS });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (roleToEdit) {
            setName(roleToEdit.name);
            try { setPermissions({ ...ALL_FALSE_PERMS, ...JSON.parse(roleToEdit.permissions) }); } catch { setPermissions({ ...ALL_FALSE_PERMS }); }
        } else {
            setName("");
            setPermissions({ ...ALL_FALSE_PERMS });
        }
    }, [roleToEdit, open]);

    const toggle = (pageId: string, action: keyof Permission) => {
        setPermissions(prev => ({
            ...prev,
            [pageId]: { ...(prev[pageId] ?? { view: false, create: false, edit: false, delete: false, void: false, print: false }), [action]: !prev[pageId]?.[action] },
        }));
    };

    const toggleAll = (action: keyof Permission, val: boolean) => {
        setPermissions(prev => {
            const updated = { ...prev };
            for (const item of ALL_PAGES) {
                updated[item.id] = { ...(updated[item.id] ?? { view: false, create: false, edit: false, delete: false, void: false, print: false }), [action]: val };
            }
            return updated;
        });
    };

    const handleSave = async () => {
        if (!name.trim()) { toast.error("Role name is required"); return; }
        setLoading(true);
        try {
            const permsJson = JSON.stringify(permissions);
            if (roleToEdit) {
                await api.roles.update({ id: roleToEdit.id, name: name.trim(), permissions: permsJson });
                toast.success("Role updated");
            } else {
                await api.roles.create({ name: name.trim(), permissions: permsJson });
                toast.success("Role created");
            }
            onSave();
            onOpenChange(false);
        } catch (e) {
            toast.error(typeof e === "string" ? e : "Failed to save role");
        } finally { setLoading(false); }
    };

    const isBuiltinAdmin = roleToEdit?.id === "role_admin";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{roleToEdit ? `Edit Role: ${roleToEdit.name}` : "Create New Role"}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col flex-1 min-h-0 gap-3">
                    {!isBuiltinAdmin && (
                        <div className="space-y-1 shrink-0">
                            <Label>Role Name</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} disabled={roleToEdit?.isBuiltin} placeholder="e.g. Warehouse Staff" />
                            {roleToEdit?.isBuiltin && <p className="text-xs text-muted-foreground">Built-in role name cannot be changed.</p>}
                        </div>
                    )}
                    {isBuiltinAdmin ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                            The Admin role has unrestricted access to everything and cannot be modified.
                        </div>
                    ) : (
                        <div className="overflow-y-auto flex-1 border rounded-lg">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-semibold">Page</th>
                                        {ACTION_COLS.map(c => (
                                            <th key={c.key} className="px-1 py-2 font-semibold text-center w-16">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span>{c.label}</span>
                                                    <div className="flex gap-0.5">
                                                        <button type="button" onClick={() => toggleAll(c.key, true)} className="text-[9px] px-1 rounded bg-primary/20 hover:bg-primary/40">All</button>
                                                        <button type="button" onClick={() => toggleAll(c.key, false)} className="text-[9px] px-1 rounded bg-muted hover:bg-muted/80">None</button>
                                                    </div>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ALL_PAGES.map((item, idx) => (
                                        <tr key={item.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                                            <td className="px-3 py-1.5 font-medium">{item.label}</td>
                                            {ACTION_COLS.map(c => {
                                                const val = !!(permissions[item.id]?.[c.key]);
                                                return (
                                                    <td key={c.key} className="px-1 py-1.5 text-center">
                                                        <button type="button" onClick={() => toggle(item.id, c.key)}
                                                            className={val ? "w-5 h-5 mx-auto rounded flex items-center justify-center bg-primary text-primary-foreground" : "w-5 h-5 mx-auto rounded flex items-center justify-center border border-muted-foreground/30 text-muted-foreground/40 hover:border-primary/50"}>
                                                            {val ? <IconCheck size={11} /> : <IconMinus size={11} />}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <DialogFooter className="pt-3 shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    {!isBuiltinAdmin && <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Save Role"}</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function RolesPage() {
    const [roles, setRoles] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
    const user = useSelector((state: RootState) => state.auth.user);

    if (user?.role !== "admin") {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center space-y-2">
                    <IconShieldLock size={48} className="mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground">Only administrators can manage roles.</p>
                </div>
            </div>
        );
    }

    const fetchRoles = async () => {
        setLoading(true);
        try { setRoles(await api.roles.list()); } catch { toast.error("Failed to load roles"); } finally { setLoading(false); }
    };

    useEffect(() => { fetchRoles(); }, []);

    const handleDelete = async (role: UserRole) => {
        if (role.isBuiltin) { toast.error("Built-in roles cannot be deleted"); return; }
        if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
        try { await api.roles.delete(role.id); toast.success("Role deleted"); fetchRoles(); }
        catch (e) { toast.error(typeof e === "string" ? e : "Failed to delete role"); }
    };

    return (
        <div className="h-full overflow-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Roles & Rights</h2>
                    <p className="text-muted-foreground text-sm">Define roles and their permissions. Assign roles to users in User Management.</p>
                </div>
                <Button onClick={() => { setSelectedRole(null); setDialogOpen(true); }}>
                    <IconPlus className="mr-2 h-4 w-4" /> New Role
                </Button>
            </div>

            <div className="border rounded-lg bg-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b bg-muted/40">
                            <th className="text-left px-4 py-3 font-semibold text-sm">Role Name</th>
                            <th className="text-left px-4 py-3 font-semibold text-sm">Type</th>
                            <th className="text-left px-4 py-3 font-semibold text-sm">Summary</th>
                            <th className="text-right px-4 py-3 font-semibold text-sm">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Loading roles...</td></tr>
                        ) : roles.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No roles found.</td></tr>
                        ) : roles.map(role => {
                            let perms: RolePermissions = {};
                            try { perms = JSON.parse(role.permissions); } catch {}
                            const viewCount = Object.values(perms).filter(p => p.view).length;
                            const totalPages = ALL_PAGES.length;
                            return (
                                <tr key={role.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <IconShieldLock size={16} className="text-muted-foreground" />
                                            <span className="font-medium">{role.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={role.isBuiltin ? "default" : "outline"}>
                                            {role.isBuiltin ? "Built-in" : "Custom"}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {role.id === "role_admin" ? "Full access to everything" : `Access to ${viewCount} of ${totalPages} pages`}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => { setSelectedRole(role); setDialogOpen(true); }} title="Edit Role">
                                                <IconEdit className="h-4 w-4" />
                                            </Button>
                                            {!role.isBuiltin && (
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(role)} className="text-destructive hover:text-destructive" title="Delete Role">
                                                    <IconTrash className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <RoleEditorDialog open={dialogOpen} onOpenChange={setDialogOpen} roleToEdit={selectedRole} onSave={fetchRoles} />
        </div>
    );
}
