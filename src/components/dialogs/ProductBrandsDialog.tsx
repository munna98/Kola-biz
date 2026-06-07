import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { api, ProductBrand, CreateProductBrand } from '@/lib/tauri';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useDialog } from '@/hooks/use-dialog';

interface ProductBrandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBrandsChange?: () => void;
}

export default function ProductBrandsDialog({ open, onOpenChange, onBrandsChange }: ProductBrandsDialogProps) {
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [brandForm, setBrandForm] = useState<CreateProductBrand>({ name: '', description: '' });
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const orderedFields = ['name', 'description'];
  const { register, handleKeyDown, refs } = useDialog(open, onOpenChange, orderedFields);

  const loadBrands = async () => {
    try {
      setLoading(true);
      const b = await api.productBrands.list();
      setBrands(b);
    } catch (error) {
      toast.error('Failed to load product brands');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadBrands();
    }
  }, [open]);

  const handleBrandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandForm.name.trim()) return;

    try {
      if (editingBrand) {
        await api.productBrands.update(editingBrand, brandForm);
        toast.success('Product brand updated successfully');
      } else {
        await api.productBrands.create(brandForm);
        toast.success('Product brand created successfully');
      }
      setBrandForm({ name: '', description: '' });
      setEditingBrand(null);
      loadBrands();
      onBrandsChange?.();
      // Keep focus for rapid entry if adding
      if (!editingBrand) {
        setTimeout(() => refs.current['name']?.focus(), 100);
      }
    } catch (error) {
      toast.error(editingBrand ? 'Failed to update brand' : 'Failed to create brand');
      console.error(error);
    }
  };

  const handleEditBrand = (b: ProductBrand) => {
    setBrandForm({ name: b.name, description: b.description });
    setEditingBrand(b.id);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  const handleDeleteBrand = async (id: string) => {
    if (confirm('Delete this product brand?')) {
      try {
        await api.productBrands.delete(id);
        toast.success('Product brand deleted successfully');
        loadBrands();
        onBrandsChange?.();
      } catch (error: any) {
        toast.error(error?.toString() || 'Failed to delete product brand');
        console.error(error);
      }
    }
  };

  const handleCancelEdit = () => {
    setBrandForm({ name: '', description: '' });
    setEditingBrand(null);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Product Brands</DialogTitle>
          <DialogDescription>
            Create and organize product brands
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Brand Form */}
          <form onSubmit={handleBrandSubmit} className="grid grid-cols-12 gap-4 pb-4 border-b items-end">
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs font-medium mb-1 block">Name *</Label>
              <Input
                ref={register('name') as any}
                placeholder="e.g., Nike"
                value={brandForm.name}
                onChange={e => setBrandForm({ ...brandForm, name: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'name')}
                className="h-8 text-sm"
                required
              />
            </div>
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input
                ref={register('description') as any}
                placeholder="Optional description"
                value={brandForm.description || ''}
                onChange={e => setBrandForm({ ...brandForm, description: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'description')}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-12 md:col-span-2 flex gap-2">
              <Button type="submit" size="sm">
                {editingBrand ? 'Update' : 'Add'}
              </Button>
              {editingBrand && (
                <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {/* Brands List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading product brands...</div>
            ) : (
              <table className="w-full">
                <thead className="border-b bg-muted/50 sticky top-0">
                  <tr className="text-left text-sm">
                    <th className="p-3">Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No product brands found. Add your first brand above.
                      </td>
                    </tr>
                  ) : (
                    brands.map(b => (
                      <tr key={b.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{b.name}</td>
                        <td className="p-3 text-sm text-muted-foreground">{b.description || '-'}</td>
                        <td className="p-3 text-sm text-muted-foreground">{formatDate(b.created_at)}</td>
                        <td className="p-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditBrand(b)}>
                            <IconEdit size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteBrand(b.id)}>
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
