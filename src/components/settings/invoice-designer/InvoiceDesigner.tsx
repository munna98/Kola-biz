import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    IconDeviceFloppy,
    IconArrowLeft,
    IconEye,
    IconDownload,
    IconUpload,
    IconZoomIn,
    IconZoomOut,
    IconGrid3x3,
    IconGridDots,
    IconArrowBackUp,
    IconArrowForwardUp,
    IconCopy,
} from '@tabler/icons-react';
import { useDesignerState } from './useDesignerState';
import { compileDesign, exportDesign, importDesign } from './designerCompiler';
import { TemplateDesign } from './types';
import DesignerCanvas from './DesignerCanvas';
import ElementToolbar from './ElementToolbar';
import PropertiesPanel from './PropertiesPanel';
import { usePrint } from '@/hooks/usePrint';
import { generateDefaultDesign, TemplateFeatures } from './generateDefaultDesign';

interface DesignerTemplateResult {
    name: string;
    layout_config: string | null;
    voucher_type: string;
    template_format: string;
    show_logo: boolean;
    show_company_address: boolean;
    show_party_address: boolean;
    show_gstin: boolean;
    show_item_hsn: boolean;
    show_bank_details: boolean;
    show_signature: boolean;
    show_terms: boolean;
    show_less_column: boolean;
}

interface InvoiceDesignerProps {
    templateId?: string;
    voucherType?: string;
    onBack: () => void;
}

export default function InvoiceDesigner({ templateId, voucherType, onBack }: InvoiceDesignerProps) {
    const [templateName, setTemplateName] = useState('Custom Template');
    const [saving, setSaving] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const { printRaw } = usePrint();

    const designer = useDesignerState();

    const [currentTemplateId, setCurrentTemplateId] = useState<string | undefined>(templateId);

    // Load existing design if templateId is provided
    useEffect(() => {
        if (currentTemplateId) {
            loadTemplate(currentTemplateId);
        }
    }, []);

    const loadTemplate = async (idToLoad: string) => {
        try {
            const result = await invoke<DesignerTemplateResult>('get_designer_template', { templateId: idToLoad });
            setTemplateName(result.name);

            if (result.layout_config) {
                // Template was previously saved with the designer — load the JSON layout
                try {
                    const design = JSON.parse(result.layout_config) as TemplateDesign;
                    designer.loadDesign(design);
                } catch {
                    // Invalid JSON; fall through to auto-generate
                    const design = generateDefaultDesign(result as TemplateFeatures);
                    designer.loadDesign(design);
                }
            } else {
                // No layout_config — auto-generate elements from the template's feature flags
                const features: TemplateFeatures = {
                    template_format: result.template_format,
                    show_logo: result.show_logo,
                    show_company_address: result.show_company_address,
                    show_party_address: result.show_party_address,
                    show_gstin: result.show_gstin,
                    show_item_hsn: result.show_item_hsn,
                    show_bank_details: result.show_bank_details,
                    show_signature: result.show_signature,
                    show_terms: result.show_terms,
                    show_less_column: result.show_less_column,
                };
                const design = generateDefaultDesign(features);
                designer.loadDesign(design);
                toast.info('Template loaded with default layout — customize it and save!');
            }
        } catch (error) {
            console.error('Failed to load template:', error);
            toast.error('Failed to load template design');
        }
    };

    // Save template (update in-place)
    const handleSave = useCallback(async () => {
        try {
            setSaving(true);
            const design = designer.getDesign();
            const compiled = compileDesign(design);
            const layoutConfig = JSON.stringify(design);

            const savedId = await invoke<string>('save_designer_template', {
                templateId: currentTemplateId || null,
                name: templateName,
                voucherType: voucherType || 'sales_invoice',
                layoutConfig,
                headerHtml: compiled.headerHtml,
                bodyHtml: compiled.bodyHtml,
                footerHtml: compiled.footerHtml,
                stylesCss: compiled.stylesCss,
            });

            if (!currentTemplateId) {
                setCurrentTemplateId(savedId);
            }

            designer.markClean();
            toast.success('Template saved successfully');
        } catch (error) {
            console.error('Failed to save template:', error);
            toast.error('Failed to save template');
        } finally {
            setSaving(false);
        }
    }, [currentTemplateId, templateName, voucherType, designer]);

    // Save as Copy — creates a brand new template with current design
    const handleSaveAsCopy = useCallback(async () => {
        try {
            setSaving(true);
            const design = designer.getDesign();
            const compiled = compileDesign(design);
            const layoutConfig = JSON.stringify(design);

            const savedId = await invoke<string>('save_designer_template', {
                templateId: null,  // force create new
                name: templateName + ' (Copy)',
                voucherType: voucherType || 'sales_invoice',
                layoutConfig,
                headerHtml: compiled.headerHtml,
                bodyHtml: compiled.bodyHtml,
                footerHtml: compiled.footerHtml,
                stylesCss: compiled.stylesCss,
            });

            // Switch to editing the new copy
            setCurrentTemplateId(savedId);
            setTemplateName(templateName + ' (Copy)');
            designer.markClean();
            toast.success('Template copied and saved as a new template!');
        } catch (error) {
            console.error('Failed to save copy:', error);
            toast.error('Failed to save copy');
        } finally {
            setSaving(false);
        }
    }, [templateName, voucherType, designer]);

    // Preview
    const handlePreview = useCallback(async () => {
        try {
            const design = designer.getDesign();
            const compiled = compileDesign(design);

            // Build complete HTML for preview
            const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${design.globalStyles.fontFamily}; }
  ${compiled.stylesCss}
</style></head><body>
  <div class="invoice-page" style="position:relative;">
    ${compiled.headerHtml}
    ${compiled.bodyHtml}
    ${compiled.footerHtml}
  </div>
</body></html>`;

            setPreviewHtml(html);
            setShowPreview(true);
        } catch (error) {
            console.error('Preview failed:', error);
            toast.error('Failed to generate preview');
        }
    }, [designer]);

    // Export design as JSON file
    const handleExport = useCallback(() => {
        try {
            const design = designer.getDesign();
            const json = exportDesign(design);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${templateName.replace(/\s+/g, '_')}_design.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Design exported');
        } catch (error) {
            toast.error('Failed to export design');
        }
    }, [designer, templateName]);

    // Import design from JSON file
    const handleImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const design = importDesign(text);
                designer.loadDesign(design);
                toast.success('Design imported successfully');
            } catch (error) {
                toast.error('Invalid design file');
            }
        };
        input.click();
    }, [designer]);

    // Print from preview
    const handlePrint = useCallback(async () => {
        if (previewHtml) {
            await printRaw(previewHtml);
        }
    }, [previewHtml, printRaw]);

    const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5];
    const currentZoomIndex = zoomLevels.indexOf(designer.zoom);

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Top Toolbar */}
            <div className="h-12 border-b flex items-center px-3 gap-2 shrink-0 bg-card">
                <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 mr-2">
                    <IconArrowLeft size={16} />
                    Back
                </Button>

                <div className="w-px h-6 bg-border" />

                {/* Template name */}
                <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    className="bg-transparent border-none text-sm font-medium w-48 focus:outline-none focus:bg-muted rounded px-2 py-1"
                    placeholder="Template Name"
                />

                <div className="flex-1" />

                {/* Undo/Redo */}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={designer.undo} disabled={!designer.canUndo} title="Undo">
                    <IconArrowBackUp size={16} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={designer.redo} disabled={!designer.canRedo} title="Redo">
                    <IconArrowForwardUp size={16} />
                </Button>

                <div className="w-px h-6 bg-border" />

                {/* Zoom controls */}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => designer.setZoom(zoomLevels[Math.max(0, currentZoomIndex - 1)] || designer.zoom - 0.25)} title="Zoom Out">
                    <IconZoomOut size={16} />
                </Button>
                <span className="text-xs w-12 text-center font-medium">{Math.round(designer.zoom * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => designer.setZoom(zoomLevels[Math.min(zoomLevels.length - 1, currentZoomIndex + 1)] || designer.zoom + 0.25)} title="Zoom In">
                    <IconZoomIn size={16} />
                </Button>

                <div className="w-px h-6 bg-border" />

                {/* Grid toggle */}
                <Button variant={designer.showGrid ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={designer.toggleGrid} title="Toggle Grid">
                    <IconGrid3x3 size={16} />
                </Button>
                <Button variant={designer.snapToGrid ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={designer.toggleSnapToGrid} title="Snap to Grid">
                    <IconGridDots size={16} />
                </Button>

                <div className="w-px h-6 bg-border" />

                {/* Import/Export */}
                <Button variant="ghost" size="sm" onClick={handleImport} className="gap-1.5 text-xs">
                    <IconUpload size={14} />
                    Import
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExport} className="gap-1.5 text-xs">
                    <IconDownload size={14} />
                    Export
                </Button>

                <div className="w-px h-6 bg-border" />

                {/* Preview & Save */}
                <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5 text-xs">
                    <IconEye size={14} />
                    Preview
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 text-xs">
                    <IconDeviceFloppy size={14} />
                    {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleSaveAsCopy} disabled={saving} className="gap-1.5 text-xs">
                    <IconCopy size={14} />
                    Save as Copy
                </Button>
                {designer.isDirty && (
                    <span className="text-[10px] text-amber-500 font-medium">Unsaved</span>
                )}
            </div>

            {/* Main editor area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Element Toolbar */}
                <ElementToolbar onAddElement={designer.addElement} />

                {/* Center: Canvas */}
                <DesignerCanvas
                    elements={designer.elements}
                    selectedElementIds={designer.selectedElementIds}
                    zoom={designer.zoom}
                    pageWidth={designer.design.pageSize.width}
                    pageHeight={designer.design.pageSize.height}
                    margins={designer.design.pageSize.margins}
                    showGrid={designer.showGrid}
                    snapToGrid={designer.snapToGrid}
                    gridSize={designer.gridSize}
                    globalStyles={designer.design.globalStyles}
                    onSelectElement={designer.selectElement}
                    onClearSelection={designer.clearSelection}
                    onUpdateElement={designer.updateElement}
                    onDeleteSelected={designer.deleteSelectedElements}
                />

                {/* Right: Properties Panel */}
                <PropertiesPanel
                    selectedElement={designer.selectedElement}
                    globalStyles={designer.design.globalStyles}
                    pageSetup={designer.design.pageSize}
                    onUpdateElement={designer.updateElement}
                    onUpdateElementStyles={designer.updateElementStyles}
                    onUpdateGlobalStyles={designer.updateGlobalStyles}
                    onUpdatePageSetup={designer.updatePageSetup}
                    onDeleteElement={designer.deleteElement}
                    onDuplicateElement={designer.duplicateElement}
                    onMoveToFront={designer.moveElementToFront}
                    onMoveToBack={designer.moveElementToBack}
                />
            </div>

            {/* Preview Dialog */}
            {showPreview && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowPreview(false)}>
                    <div className="bg-background rounded-xl shadow-2xl w-[90vw] h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-3 border-b">
                            <h3 className="text-sm font-semibold">Preview (Raw Template — Sample data not loaded)</h3>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
                                    Print
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setShowPreview(false)} className="text-xs">
                                    Close
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 p-4">
                            <iframe
                                srcDoc={previewHtml}
                                className="w-full h-full bg-white shadow-sm rounded border mx-auto"
                                style={{ maxWidth: `${designer.design.pageSize.width * 3.78}px` }}
                                title="Template Preview"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
