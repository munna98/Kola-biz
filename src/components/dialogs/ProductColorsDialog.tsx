import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { api, ProductColor, CreateProductColor } from '@/lib/tauri';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useDialog } from '@/hooks/use-dialog';

interface ProductColorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onColorsChange?: () => void;
}

export default function ProductColorsDialog({ open, onOpenChange, onColorsChange }: ProductColorsDialogProps) {
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [colorForm, setColorForm] = useState<CreateProductColor>({ name: '', hex_code: '', description: '' });
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const orderedFields = ['name', 'hex_code', 'description'];
  const { register, handleKeyDown, refs } = useDialog(open, onOpenChange, orderedFields);

  const loadColors = async () => {
    try {
      setLoading(true);
      const c = await api.productColors.list();
      setColors(c);
    } catch (error) {
      toast.error('Failed to load product colors');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadColors();
    }
  }, [open]);

  const handleColorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colorForm.name.trim()) return;

    try {
      if (editingColor) {
        await api.productColors.update(editingColor, colorForm);
        toast.success('Product color updated successfully');
      } else {
        await api.productColors.create(colorForm);
        toast.success('Product color created successfully');
      }
      setColorForm({ name: '', hex_code: '', description: '' });
      setEditingColor(null);
      loadColors();
      onColorsChange?.();
      if (!editingColor) {
        setTimeout(() => refs.current['name']?.focus(), 100);
      }
    } catch (error) {
      toast.error(editingColor ? 'Failed to update color' : 'Failed to create color');
      console.error(error);
    }
  };

  const handleEditColor = (c: ProductColor) => {
    setColorForm({ name: c.name, hex_code: c.hex_code || '', description: c.description || '' });
    setEditingColor(c.id);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  const handleDeleteColor = async (id: string) => {
    if (confirm('Delete this product color?')) {
      try {
        await api.productColors.delete(id);
        toast.success('Product color deleted successfully');
        loadColors();
        onColorsChange?.();
      } catch (error: any) {
        toast.error(error?.toString() || 'Failed to delete product color');
        console.error(error);
      }
    }
  };

  const handleCancelEdit = () => {
    setColorForm({ name: '', hex_code: '', description: '' });
    setEditingColor(null);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Product Colors</DialogTitle>
          <DialogDescription>
            Create and organize product colors
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Color Form */}
          <form onSubmit={handleColorSubmit} className="grid grid-cols-12 gap-4 pb-4 border-b items-end">
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs font-medium mb-1 block">Name *</Label>
              <Input
                ref={register('name') as any}
                placeholder="e.g., Midnight Black"
                value={colorForm.name}
                onChange={e => setColorForm({ ...colorForm, name: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'name')}
                className="h-8 text-sm"
                required
              />
            </div>
            <div className="col-span-12 md:col-span-3">
              <Label className="text-xs font-medium mb-1 block">Hex Code</Label>
              <div className="flex gap-2 items-center">
                <Input
                  ref={register('hex_code') as any}
                  placeholder="#000000"
                  value={colorForm.hex_code || ''}
                  onChange={e => setColorForm({ ...colorForm, hex_code: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, 'hex_code')}
                  className="h-8 text-sm font-mono"
                />
                {colorForm.hex_code && (
                  <span
                    className="w-6 h-6 rounded-full border shrink-0"
                    style={{ backgroundColor: colorForm.hex_code }}
                  />
                )}
              </div>
            </div>
            <div className="col-span-12 md:col-span-3">
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input
                ref={register('description') as any}
                placeholder="Optional description"
                value={colorForm.description || ''}
                onChange={e => setColorForm({ ...colorForm, description: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'description')}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-12 md:col-span-2 flex gap-2">
              <Button type="submit" size="sm">
                {editingColor ? 'Update' : 'Add'}
              </Button>
              {editingColor && (
                <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {/* Colors List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading product colors...</div>
            ) : (
              <table className="w-full">
                <thead className="border-b bg-muted/50 sticky top-0">
                  <tr className="text-left text-sm">
                    <th className="p-3">Color</th>
                    <th className="p-3">Hex Code</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {colors.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No product colors found. Add your first color above.
                      </td>
                    </tr>
                  ) : (
                    colors.map(c => (
                      <tr key={c.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium flex items-center gap-2">
                          {c.hex_code ? (
                            <span
                              className="w-4 h-4 rounded-full border shrink-0 inline-block"
                              style={{ backgroundColor: c.hex_code }}
                            />
                          ) : (
                            <span className="w-4 h-4 rounded-full border shrink-0 inline-block bg-muted" />
                          )}
                          {c.name}
                        </td>
                        <td className="p-3 text-sm font-mono text-muted-foreground">{c.hex_code || '-'}</td>
                        <td className="p-3 text-sm text-muted-foreground">{c.description || '-'}</td>
                        <td className="p-3 text-sm text-muted-foreground">{formatDate(c.created_at)}</td>
                        <td className="p-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditColor(c)}>
                            <IconEdit size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteColor(c.id)}>
                            <IconTrash size={16} />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
