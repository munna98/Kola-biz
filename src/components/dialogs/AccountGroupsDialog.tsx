import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconTrash, IconChevronRight, IconChevronDown, IconLock, IconFolderFilled, IconFolder } from '@tabler/icons-react';
import { api, AccountGroup, AccountGroupNode, buildAccountGroupTree, flattenGroupTree, CreateAccountGroup } from '@/lib/tauri';
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AccountGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupsChanged?: () => void;
}

const BASE_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

// ---- Tree Node Component ----
interface GroupTreeNodeProps {
  node: AccountGroupNode;
  onDelete: (id: string, name: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function GroupTreeNode({ node, onDelete, selectedId, onSelect }: GroupTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const bgClass = selectedId === node.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40';

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer group text-sm transition-colors',
          bgClass
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/Collapse toggle */}
        {hasChildren ? (
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {/* Folder icon */}
        <span className="shrink-0 text-muted-foreground">
          {hasChildren
            ? (expanded ? <IconFolderFilled size={14} /> : <IconFolder size={14} />)
            : <IconFolder size={14} />
          }
        </span>

        {/* Group name */}
        <span className="flex-1 truncate font-medium">{node.name}</span>

        {/* Base type badge on root groups */}
        {!node.parent_group_id && node.base_type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono shrink-0">
            {node.base_type}
          </span>
        )}

        {/* Lock or Delete */}
        {node.is_system === 1 ? (
          <span className="shrink-0 text-muted-foreground opacity-50 group-hover:opacity-100 ml-1" title="System group — protected">
            <IconLock size={12} />
          </span>
        ) : (
          <button
            className="shrink-0 text-destructive opacity-0 group-hover:opacity-100 ml-1 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.name); }}
            title="Delete group"
          >
            <IconTrash size={13} />
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {node.children.map(child => (
            <GroupTreeNode
              key={child.id}
              node={child}
              onDelete={onDelete}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main Dialog ----
export default function AccountGroupsDialog({ open, onOpenChange, onGroupsChanged }: AccountGroupsDialogProps) {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [treeRoots, setTreeRoots] = useState<AccountGroupNode[]>([]);
  const [flatList, setFlatList] = useState<AccountGroupNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateAccountGroup>({
    name: '',
    account_type: 'Asset',
    parent_group_id: null,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.accountGroups.getTree();
      setGroups(data);
      const tree = buildAccountGroupTree(data);
      setTreeRoots(tree);
      setFlatList(flattenGroupTree(tree));
    } catch (error) {
      toast.error('Failed to load account groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setForm({ name: '', account_type: 'Asset', parent_group_id: null });
      setSelectedId(null);
    }
  }, [open, load]);

  // When a parent is selected in the form, auto-derive account_type from parent's base_type
  const handleParentChange = (parentId: string | null) => {
    if (!parentId) {
      setForm(f => ({ ...f, parent_group_id: null }));
      return;
    }
    const parent = groups.find(g => g.id === parentId);
    if (parent) {
      // Walk up to find base_type
      let current: AccountGroup | undefined = parent;
      let baseType = parent.account_type;
      while (current) {
        if (current.base_type) { baseType = current.base_type; break; }
        if (!current.parent_group_id) break;
        current = groups.find(g => g.id === current!.parent_group_id);
      }
      setForm(f => ({ ...f, parent_group_id: parentId, account_type: baseType }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api.accountGroups.create(form);
      toast.success('Group created successfully');
      setForm({ name: '', account_type: 'Asset', parent_group_id: form.parent_group_id });
      await load();
      onGroupsChanged?.();
    } catch (error: any) {
      toast.error(error?.toString() || 'Failed to create group');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return;
    try {
      await api.accountGroups.delete(id);
      toast.success(`"${name}" deleted`);
      await load();
      onGroupsChanged?.();
    } catch (error: any) {
      toast.error(error?.toString() || 'Failed to delete group');
    }
  };

  // Combobox options for parent picker — exclude self (for edit safety) and show indent
  const parentOptions = flatList.map(node => ({
    value: node.id,
    label: '\u00A0'.repeat(node.depth * 2) + node.name,
    searchString: node.name, // cmdk filters by actual name
  }));

  const handleParentChangeTyped = (v: string | number) => handleParentChange(v ? String(v) : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Account Groups</DialogTitle>
          <DialogDescription>
            Create and organise groups in a hierarchy. Groups under system groups are protected.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          {/* ---- Left: Group Tree ---- */}
          <div className="w-1/2 border rounded-lg overflow-y-auto p-2">
            {loading ? (
              <p className="text-sm text-muted-foreground p-3">Loading...</p>
            ) : treeRoots.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">No groups yet.</p>
            ) : (
              treeRoots.map(root => (
                <GroupTreeNode
                  key={root.id}
                  node={root}
                  onDelete={handleDelete}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))
            )}
          </div>

          {/* ---- Right: Create Form ---- */}
          <div className="w-1/2 flex flex-col gap-4">
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <p className="text-sm font-semibold">Add New Group</p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <Label className="text-xs mb-1 block">Group Name *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Plant & Machinery"
                    className="h-8 text-sm"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <Label className="text-xs mb-1 block">Under Group (Parent)</Label>
                  <Combobox
                    options={[{ value: '', label: '— None (Primary Group) —', searchString: 'none primary root' }, ...parentOptions]}
                    value={form.parent_group_id ?? ''}
                    onChange={handleParentChangeTyped}
                    placeholder="Select parent group..."
                    className="w-full h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs mb-1 block">Type (auto-derived from parent)</Label>
                  <Select
                    value={form.account_type}
                    onValueChange={v => setForm(f => ({ ...f, account_type: v }))}
                    disabled={!!form.parent_group_id}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BASE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.parent_group_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Derived from parent group
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full h-8">
                  <IconPlus size={14} /> Add Group
                </Button>
              </form>
            </div>

            {/* Legend */}
            <div className="text-xs text-muted-foreground space-y-1 px-1">
              <div className="flex items-center gap-2">
                <IconLock size={12} className="shrink-0" />
                <span>System groups are protected and cannot be deleted.</span>
              </div>
              <div className="flex items-center gap-2">
                <IconTrash size={12} className="shrink-0 text-destructive" />
                <span>Only user-created groups with no ledgers or sub-groups can be deleted.</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
