import { useState, useEffect } from 'react';
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

export default function ProductImagesDialog({ open, onOpenChange, productId, productName }: ProductImagesDialogProps) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const loadImages = async () => {
    if (!productId) return;
    try {
      setLoading(true);
      const imgs = await api.products.getImages(productId);
      // Sort images by display_order
      setImages(imgs.sort((a, b) => a.display_order - b.display_order));
    } catch (error) {
      toast.error('Failed to load product images');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && productId) {
      loadImages();
    }
  }, [open, productId]);

  const uploadFiles = async (files: FileList) => {
    if (images.length + files.length > 10) {
      toast.error('You can upload a maximum of 10 images per product.');
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Convert file to Base64
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });

        await api.products.uploadImage(productId, file.name, base64Data);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    e.target.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Filter out non-images
      const dt = new DataTransfer();
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (file.type.startsWith('image/')) {
          dt.items.add(file);
        }
      }
      if (dt.files.length === 0) {
        toast.error('Only image files are supported.');
        return;
      }
      await uploadFiles(dt.files);
    }
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

    // Swap
    const temp = newImages[index];
    newImages[index] = newImages[targetIndex];
    newImages[targetIndex] = temp;

    // Set temporary state for immediate feedback
    setImages(newImages);

    try {
      // Reorder call
      const ids = newImages.map(img => img.id);
      await api.products.reorderImages(ids);
      loadImages();
    } catch (error) {
      toast.error('Failed to update image order');
      console.error(error);
      loadImages(); // Revert back
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
            Upload up to 10 images for this product. Drag & drop files or browse to upload. Use arrows to change display order.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Zone */}
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`p-4 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition cursor-pointer relative group ${
            dragActive 
              ? 'border-primary bg-primary/10' 
              : 'border-muted bg-muted/20 hover:bg-muted/30'
          }`}
        >
          <input
            type="file"
            multiple
            accept="image/png, image/jpeg, image/jpg, image/webp"
            onChange={handleFileUpload}
            disabled={uploading || images.length >= 10}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          {uploading ? (
            <>
              <IconLoader2 className="animate-spin text-primary" size={32} />
              <span className="text-sm font-medium text-muted-foreground">Uploading images...</span>
            </>
          ) : (
            <>
              <IconUpload className="text-muted-foreground group-hover:text-primary transition" size={32} />
              <span className="text-sm font-medium">Click or Drag images to upload</span>
              <span className="text-xs text-muted-foreground">Supports PNG, JPG, JPEG, WEBP (Max 10 images. Currently: {images.length}/10)</span>
            </>
          )}
        </div>

        {/* Images Grid */}
        <div className="flex-1 overflow-y-auto min-h-[250px] mt-4 pr-1">
          {loading && images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <IconLoader2 className="animate-spin text-primary" size={24} />
              <span className="text-sm text-muted-foreground">Loading images...</span>
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
                  {/* Image Display */}
                  <div className="flex-1 bg-black/5 flex items-center justify-center overflow-hidden relative">
                    <img
                      src={convertFileSrc(img.image_path)}
                      alt={`Product image ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    
                    {/* Badge */}
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

                    {/* Delete button (visible on hover) */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
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

                  {/* Reordering controls */}
                  <div className="p-1.5 border-t bg-muted/40 flex justify-between items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'left')}
                    >
                      <IconArrowLeft size={14} />
                    </Button>
                    <span className="text-[10px] text-muted-foreground font-medium select-none">
                      {index === 0 ? 'Cover' : `Order ${index + 1}`}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
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
