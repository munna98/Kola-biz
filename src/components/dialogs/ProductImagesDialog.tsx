import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconTrash, IconArrowLeft, IconArrowRight, IconUpload, IconPhoto, IconLoader2 } from '@tabler/icons-react';
import { api, ProductImage } from '@/lib/tauri';
import { toast } from 'sonner';
import { convertFileSrc } from '@tauri-apps/api/core';

interface ProductImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

export default function ProductImagesDialog({ open, onOpenChange, productId, productName }: ProductImagesDialogProps) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Keep a ref so Tauri event callbacks always see the latest images count
  const imagesRef = useRef<ProductImage[]>([]);
  const productIdRef = useRef(productId);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => { productIdRef.current = productId; }, [productId]);

  const loadImages = async () => {
    if (!productId) return;
    try {
      setLoading(true);
      const imgs = await api.products.getImages(productId);
      setImages(imgs.sort((a, b) => a.display_order - b.display_order));
    } catch (error) {
      toast.error('Failed to load product images');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && productId) loadImages();
  }, [open, productId]);

  // ─── Upload from FileList (click-to-browse) ───────────────────────────────
  const uploadFiles = async (files: FileList) => {
    if (imagesRef.current.length + files.length > 10) {
      toast.error('You can upload a maximum of 10 images per product.');
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        await api.products.uploadImage(productIdRef.current, file.name, base64Data);
      }
      toast.success('Images uploaded successfully');
      loadImages();
    } catch (error) {
      toast.error('Failed to upload image(s)');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  // ─── Upload from OS file paths (Tauri drag-drop) ─────────────────────────
  const uploadFromPaths = async (paths: string[]) => {
    const filtered = paths.filter(p => {
      const ext = p.split('.').pop()?.toLowerCase() ?? '';
      return IMAGE_EXTENSIONS.includes(ext);
    });

    if (filtered.length === 0) {
      toast.error('Only image files are supported (PNG, JPG, WEBP).');
      return;
    }
    if (imagesRef.current.length + filtered.length > 10) {
      toast.error('You can upload a maximum of 10 images per product.');
      return;
    }

    setUploading(true);
    try {
      for (const path of filtered) {
        const fileName = path.split(/[\\/]/).pop() || 'image.jpg';
        // Read the OS file via Tauri's asset protocol
        const url = convertFileSrc(path);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Could not read file: ${path}`);
        const blob = await resp.blob();
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        await api.products.uploadImage(productIdRef.current, fileName, base64Data);
      }
      toast.success('Images uploaded successfully');
      loadImages();
    } catch (error) {
      toast.error('Failed to upload image(s)');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  // ─── Tauri native file-drop listeners ────────────────────────────────────
  // Browser drag events don't receive OS file drops in Tauri; we must listen
  // to the tauri://drag-* events which carry real file system paths.
  useEffect(() => {
    if (!open) return;

    const unlisteners: Array<() => void> = [];

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');

      unlisteners.push(
        await listen('tauri://drag-enter', () => setDragActive(true)),
        await listen('tauri://drag-over',  () => setDragActive(true)),
        await listen('tauri://drag-leave', () => setDragActive(false)),
        await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
          setDragActive(false);
          await uploadFromPaths(event.payload.paths);
        }),
      );
    })();

    return () => {
      unlisteners.forEach(fn => fn());
    };
  }, [open]); // uploadFromPaths uses refs so deps are stable

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    e.target.value = '';
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Are you sure you want to delete this image?')) return;
    try {
      await api.products.deleteImage(imageId);
      toast.success('Image deleted successfully');
      loadImages();
    } catch (error) {
      toast.error('Failed to delete image');
      console.error(error);
    }
  };

  const handleMove = async (index: number, direction: 'left' | 'right') => {
    const newImages = [...images];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newImages.length) return;

    [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];
    setImages(newImages);

    try {
      await api.products.reorderImages(newImages.map(img => img.id));
      loadImages();
    } catch (error) {
      toast.error('Failed to update image order');
      loadImages();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconPhoto className="text-primary" />
            <span>Product Images: {productName}</span>
          </DialogTitle>
          <DialogDescription>
            Upload up to 10 images. Drag &amp; drop files from your file explorer, or click to browse.
            Use arrows to change display order.
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload / Drop Zone ── */}
        <div
          onClick={() => !uploading && images.length < 10 && fileInputRef.current?.click()}
          className={[
            'p-6 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2',
            'transition-all duration-150 cursor-pointer select-none group',
            dragActive
              ? 'border-primary bg-primary/10 scale-[1.01]'
              : 'border-muted bg-muted/20 hover:bg-muted/30',
            uploading || images.length >= 10 ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
        >
          {/* Hidden input — pointer-events-none so it never captures drag events */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            onChange={handleFileInput}
            className="hidden"
          />

          {uploading ? (
            <>
              <IconLoader2 className="animate-spin text-primary" size={32} />
              <span className="text-sm font-medium text-muted-foreground">Uploading images…</span>
            </>
          ) : dragActive ? (
            <>
              <IconUpload className="text-primary" size={36} />
              <span className="text-sm font-semibold text-primary">Drop images here</span>
            </>
          ) : (
            <>
              <IconUpload className="text-muted-foreground group-hover:text-primary transition" size={32} />
              <span className="text-sm font-medium">Click or drag &amp; drop images to upload</span>
              <span className="text-xs text-muted-foreground">
                PNG, JPG, JPEG, WEBP · Max 10 images · {images.length}/10 uploaded
              </span>
            </>
          )}
        </div>

        {/* ── Images Grid ── */}
        <div className="flex-1 overflow-y-auto min-h-[250px] mt-4 pr-1">
          {loading && images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <IconLoader2 className="animate-spin text-primary" size={24} />
              <span className="text-sm text-muted-foreground">Loading images…</span>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-lg bg-muted/10">
              <IconPhoto size={40} className="text-muted-foreground/50 mb-2" />
              <span className="text-sm text-muted-foreground">No images uploaded yet.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-1">
              {images.map((img, index) => (
                <div key={img.id} className="relative aspect-square rounded-lg border bg-card overflow-hidden group shadow-sm flex flex-col">
                  {/* Image */}
                  <div className="flex-1 bg-black/5 flex items-center justify-center overflow-hidden relative">
                    <img
                      src={convertFileSrc(img.image_path)}
                      alt={`Product image ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex gap-1">
                      <span className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        #{index + 1}
                      </span>
                      {index === 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-semibold shadow-sm">
                          Cover
                        </span>
                      )}
                    </div>
                    {/* Delete overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8 rounded-full"
                        onClick={() => handleDeleteImage(img.id)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </div>
                  </div>

                  {/* Reorder controls */}
                  <div className="p-1.5 border-t bg-muted/40 flex justify-between items-center gap-2">
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'left')}
                    >
                      <IconArrowLeft size={14} />
                    </Button>
                    <span className="text-[10px] text-muted-foreground font-medium select-none">
                      {index === 0 ? 'Cover' : `Order ${index + 1}`}
                    </span>
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      disabled={index === images.length - 1}
                      onClick={() => handleMove(index, 'right')}
                    >
                      <IconArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
