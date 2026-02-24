import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    IconAlignLeft,
    IconAlignCenter,
    IconAlignRight,
    IconBold,
    IconItalic,
    IconUnderline,
    IconTrash,
    IconCopy,
    IconArrowUp,
    IconArrowDown,
    IconLock,
    IconLockOpen,
    IconTextSize,
} from '@tabler/icons-react';
import {
    DesignerElement,
    ElementStyles,
    GlobalStyles,
    PageSetup,
    FONT_FAMILIES,
    TableColumn,
} from './types';
import { DATA_FIELD_CATALOG, ITEM_TABLE_COLUMNS } from './DataFieldCatalog';

interface PropertiesPanelProps {
    selectedElement: DesignerElement | null;
    globalStyles: GlobalStyles;
    pageSetup: PageSetup;
    onUpdateElement: (id: string, changes: Partial<DesignerElement>) => void;
    onUpdateElementStyles: (id: string, styleChanges: Partial<ElementStyles>) => void;
    onUpdateGlobalStyles: (changes: Partial<GlobalStyles>) => void;
    onUpdatePageSetup: (changes: Partial<PageSetup>) => void;
    onDeleteElement: (id: string) => void;
    onDuplicateElement: (id: string) => void;
    onMoveToFront: (id: string) => void;
    onMoveToBack: (id: string) => void;
}

function ColorInput({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground w-20 shrink-0">{label}</Label>
            <div className="flex items-center gap-1 flex-1">
                <input
                    type="color"
                    value={value || '#000000'}
                    onChange={e => onChange(e.target.value)}
                    className="w-7 h-7 rounded border cursor-pointer p-0.5"
                />
                <Input
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder="#000000"
                    className="h-7 text-xs flex-1"
                />
            </div>
        </div>
    );
}

function NumberInput({ label, value, onChange, min, max, step, unit }: {
    label: string; value?: number; onChange: (v: number) => void;
    min?: number; max?: number; step?: number; unit?: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground w-8 shrink-0">{label}</Label>
            <div className="flex items-center gap-1 flex-1">
                <Input
                    type="number"
                    value={value ?? ''}
                    onChange={e => onChange(parseFloat(e.target.value) || 0)}
                    min={min}
                    max={max}
                    step={step || 1}
                    className="h-7 text-xs flex-1"
                />
                {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
            </div>
        </div>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 mt-3 first:mt-0">
            {title}
        </p>
    );
}

export default function PropertiesPanel({
    selectedElement,
    globalStyles,
    pageSetup,
    onUpdateElement,
    onUpdateElementStyles,
    onUpdateGlobalStyles,
    onUpdatePageSetup,
    onDeleteElement,
    onDuplicateElement,
    onMoveToFront,
    onMoveToBack,
}: PropertiesPanelProps) {
    const [activeTab, setActiveTab] = useState<'element' | 'page'>('element');
    const el = selectedElement;

    return (
        <div className="w-[280px] border-l bg-card flex flex-col shrink-0 overflow-hidden">
            {/* Tab buttons */}
            <div className="flex border-b">
                <button
                    className={`flex-1 text-xs py-2 font-medium transition-colors ${activeTab === 'element' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
                    onClick={() => setActiveTab('element')}
                >
                    Element
                </button>
                <button
                    className={`flex-1 text-xs py-2 font-medium transition-colors ${activeTab === 'page' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
                    onClick={() => setActiveTab('page')}
                >
                    Page
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-3 space-y-1">
                    {activeTab === 'page' ? (
                        // ===== PAGE TAB =====
                        <>
                            <SectionHeader title="Page Size" />
                            <NumberInput label="Width" value={pageSetup.width} onChange={v => onUpdatePageSetup({ width: v })} min={40} max={500} unit="mm" />
                            <NumberInput label="Height" value={pageSetup.height} onChange={v => onUpdatePageSetup({ height: v })} min={40} max={500} unit="mm" />

                            <SectionHeader title="Margins" />
                            <NumberInput label="Top" value={pageSetup.margins.top} onChange={v => onUpdatePageSetup({ margins: { ...pageSetup.margins, top: v } })} min={0} max={50} unit="mm" />
                            <NumberInput label="Right" value={pageSetup.margins.right} onChange={v => onUpdatePageSetup({ margins: { ...pageSetup.margins, right: v } })} min={0} max={50} unit="mm" />
                            <NumberInput label="Bottom" value={pageSetup.margins.bottom} onChange={v => onUpdatePageSetup({ margins: { ...pageSetup.margins, bottom: v } })} min={0} max={50} unit="mm" />
                            <NumberInput label="Left" value={pageSetup.margins.left} onChange={v => onUpdatePageSetup({ margins: { ...pageSetup.margins, left: v } })} min={0} max={50} unit="mm" />

                            <SectionHeader title="Default Styles" />
                            <div className="flex items-center gap-2">
                                <Label className="text-[11px] text-muted-foreground w-20 shrink-0">Font</Label>
                                <Select value={globalStyles.fontFamily} onValueChange={v => onUpdateGlobalStyles({ fontFamily: v })}>
                                    <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {FONT_FAMILIES.map(f => (
                                            <SelectItem key={f} value={f} className="text-xs">{f.split(',')[0]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <NumberInput label="Font Size" value={globalStyles.fontSize} onChange={v => onUpdateGlobalStyles({ fontSize: v })} min={6} max={72} unit="pt" />
                            <ColorInput label="Text Color" value={globalStyles.color} onChange={v => onUpdateGlobalStyles({ color: v })} />
                            <ColorInput label="Page BG" value={globalStyles.backgroundColor} onChange={v => onUpdateGlobalStyles({ backgroundColor: v })} />
                        </>
                    ) : el ? (
                        // ===== ELEMENT TAB (selected) =====
                        <>
                            {/* Element info bar */}
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium capitalize">{el.type}: {el.label || ''}</span>
                                <div className="flex gap-0.5">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDuplicateElement(el.id)} title="Duplicate">
                                        <IconCopy size={13} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMoveToFront(el.id)} title="Bring to Front">
                                        <IconArrowUp size={13} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMoveToBack(el.id)} title="Send to Back">
                                        <IconArrowDown size={13} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onUpdateElement(el.id, { locked: !el.locked })} title={el.locked ? 'Unlock' : 'Lock'}>
                                        {el.locked ? <IconLock size={13} /> : <IconLockOpen size={13} />}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => onDeleteElement(el.id)} title="Delete">
                                        <IconTrash size={13} />
                                    </Button>
                                </div>
                            </div>

                            {/* Position & Size */}
                            <SectionHeader title="Position & Size" />
                            <div className="grid grid-cols-2 gap-1.5">
                                <NumberInput label="X" value={Math.round(el.x * 10) / 10} onChange={v => onUpdateElement(el.id, { x: v })} min={0} step={0.5} unit="mm" />
                                <NumberInput label="Y" value={Math.round(el.y * 10) / 10} onChange={v => onUpdateElement(el.id, { y: v })} min={0} step={0.5} unit="mm" />
                                <NumberInput label="W" value={Math.round(el.width * 10) / 10} onChange={v => onUpdateElement(el.id, { width: v })} min={3} step={0.5} unit="mm" />
                                <NumberInput label="H" value={Math.round(el.height * 10) / 10} onChange={v => onUpdateElement(el.id, { height: v })} min={3} step={0.5} unit="mm" />
                            </div>

                            {/* Content (text type) */}
                            {el.type === 'text' && (
                                <>
                                    <SectionHeader title="Content" />
                                    <textarea
                                        value={el.content || ''}
                                        onChange={e => onUpdateElement(el.id, { content: e.target.value })}
                                        className="w-full text-xs border rounded p-2 min-h-[60px] resize-y bg-background"
                                        placeholder="Enter text..."
                                    />
                                </>
                            )}

                            {/* Label */}
                            <SectionHeader title="Label" />
                            <Input
                                value={el.label || ''}
                                onChange={e => onUpdateElement(el.id, { label: e.target.value })}
                                className="h-7 text-xs"
                                placeholder="Element label"
                            />

                            {/* Data Binding (field type) */}
                            {el.type === 'field' && (
                                <>
                                    <SectionHeader title="Data Binding" />
                                    <Select
                                        value={el.fieldBinding || ''}
                                        onValueChange={v => {
                                            const field = DATA_FIELD_CATALOG.flatMap(c => c.fields).find(f => f.key === v);
                                            onUpdateElement(el.id, { fieldBinding: v, label: field?.label || v });
                                        }}
                                    >
                                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select field..." /></SelectTrigger>
                                        <SelectContent>
                                            {DATA_FIELD_CATALOG.map(cat => (
                                                <div key={cat.name}>
                                                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase">{cat.name}</div>
                                                    {cat.fields.map(field => (
                                                        <SelectItem key={field.key} value={field.key} className="text-xs pl-4">
                                                            {field.label}
                                                        </SelectItem>
                                                    ))}
                                                </div>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}

                            {/* Typography */}
                            {(el.type === 'text' || el.type === 'field' || el.type === 'totals') && (
                                <>
                                    <SectionHeader title="Typography" />
                                    <div className="flex items-center gap-2">
                                        <Label className="text-[11px] text-muted-foreground w-20 shrink-0">Font</Label>
                                        <Select
                                            value={el.styles.fontFamily || 'inherit'}
                                            onValueChange={v => onUpdateElementStyles(el.id, { fontFamily: v === 'inherit' ? undefined : v })}
                                        >
                                            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Inherit" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="inherit" className="text-xs">Inherit (Global)</SelectItem>
                                                {FONT_FAMILIES.map(f => (
                                                    <SelectItem key={f} value={f} className="text-xs">{f.split(',')[0]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <NumberInput label="Size" value={el.styles.fontSize} onChange={v => onUpdateElementStyles(el.id, { fontSize: v })} min={4} max={72} unit="pt" />

                                    {/* Bold/Italic/Underline + Alignment */}
                                    <div className="flex gap-1 mt-1">
                                        <Button
                                            variant={el.styles.fontWeight === 'bold' ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onUpdateElementStyles(el.id, { fontWeight: el.styles.fontWeight === 'bold' ? 'normal' : 'bold' })}
                                        >
                                            <IconBold size={13} />
                                        </Button>
                                        <Button
                                            variant={el.styles.fontStyle === 'italic' ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onUpdateElementStyles(el.id, { fontStyle: el.styles.fontStyle === 'italic' ? 'normal' : 'italic' })}
                                        >
                                            <IconItalic size={13} />
                                        </Button>
                                        <Button
                                            variant={el.styles.textDecoration === 'underline' ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onUpdateElementStyles(el.id, { textDecoration: el.styles.textDecoration === 'underline' ? 'none' : 'underline' })}
                                        >
                                            <IconUnderline size={13} />
                                        </Button>
                                        <div className="w-px bg-border mx-1" />
                                        <Button
                                            variant={el.styles.textAlign === 'left' ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onUpdateElementStyles(el.id, { textAlign: 'left' })}
                                        >
                                            <IconAlignLeft size={13} />
                                        </Button>
                                        <Button
                                            variant={el.styles.textAlign === 'center' ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onUpdateElementStyles(el.id, { textAlign: 'center' })}
                                        >
                                            <IconAlignCenter size={13} />
                                        </Button>
                                        <Button
                                            variant={el.styles.textAlign === 'right' ? 'default' : 'outline'}
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => onUpdateElementStyles(el.id, { textAlign: 'right' })}
                                        >
                                            <IconAlignRight size={13} />
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-2 mt-1">
                                        <Label className="text-[11px] text-muted-foreground w-20 shrink-0">Transform</Label>
                                        <Select
                                            value={el.styles.textTransform || 'none'}
                                            onValueChange={v => onUpdateElementStyles(el.id, { textTransform: v as 'none' | 'uppercase' | 'lowercase' | 'capitalize' })}
                                        >
                                            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none" className="text-xs">None</SelectItem>
                                                <SelectItem value="uppercase" className="text-xs">UPPERCASE</SelectItem>
                                                <SelectItem value="lowercase" className="text-xs">lowercase</SelectItem>
                                                <SelectItem value="capitalize" className="text-xs">Capitalize</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <NumberInput label="Line Height" value={el.styles.lineHeight} onChange={v => onUpdateElementStyles(el.id, { lineHeight: v })} min={0.5} max={3} step={0.1} />
                                </>
                            )}

                            {/* Colors */}
                            <SectionHeader title="Colors" />
                            <ColorInput label="Text" value={el.styles.color} onChange={v => onUpdateElementStyles(el.id, { color: v })} />
                            <ColorInput label="Background" value={el.styles.backgroundColor} onChange={v => onUpdateElementStyles(el.id, { backgroundColor: v })} />

                            {/* Border */}
                            <SectionHeader title="Border" />
                            <div className="flex items-center gap-2">
                                <Label className="text-[11px] text-muted-foreground w-20 shrink-0">Border</Label>
                                <Input
                                    value={el.styles.border || ''}
                                    onChange={e => onUpdateElementStyles(el.id, { border: e.target.value })}
                                    placeholder="1px solid #000"
                                    className="h-7 text-xs flex-1"
                                />
                            </div>
                            <NumberInput label="Radius" value={el.styles.borderRadius} onChange={v => onUpdateElementStyles(el.id, { borderRadius: v })} min={0} max={50} unit="px" />
                            <NumberInput label="Padding" value={el.styles.padding} onChange={v => onUpdateElementStyles(el.id, { padding: v })} min={0} max={20} step={0.5} unit="mm" />

                            {/* Divider-specific */}
                            {el.type === 'divider' && (
                                <>
                                    <SectionHeader title="Divider Style" />
                                    <div className="flex items-center gap-2">
                                        <Label className="text-[11px] text-muted-foreground w-20 shrink-0">Style</Label>
                                        <Select
                                            value={el.dividerStyle || 'solid'}
                                            onValueChange={v => onUpdateElement(el.id, { dividerStyle: v as any })}
                                        >
                                            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="solid" className="text-xs">Solid</SelectItem>
                                                <SelectItem value="dashed" className="text-xs">Dashed</SelectItem>
                                                <SelectItem value="dotted" className="text-xs">Dotted</SelectItem>
                                                <SelectItem value="double" className="text-xs">Double</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <ColorInput label="Color" value={el.dividerColor} onChange={v => onUpdateElement(el.id, { dividerColor: v })} />
                                    <NumberInput label="Thickness" value={el.dividerThickness} onChange={v => onUpdateElement(el.id, { dividerThickness: v })} min={1} max={10} unit="px" />
                                </>
                            )}

                            {/* Table-specific */}
                            {el.type === 'table' && el.tableConfig && (
                                <>
                                    <SectionHeader title="Table Settings" />
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[11px]">Show Header</Label>
                                        <Switch
                                            checked={el.tableConfig.showHeader}
                                            onCheckedChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, showHeader: v } })}
                                            className="h-4 w-7"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[11px]">Striped Rows</Label>
                                        <Switch
                                            checked={el.tableConfig.stripedRows}
                                            onCheckedChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, stripedRows: v } })}
                                            className="h-4 w-7"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label className="text-[11px] text-muted-foreground w-20 shrink-0">Borders</Label>
                                        <Select
                                            value={el.tableConfig.borderStyle || 'full'}
                                            onValueChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, borderStyle: v as any } })}
                                        >
                                            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="full" className="text-xs">Full Grid</SelectItem>
                                                <SelectItem value="horizontal" className="text-xs">Horizontal Only</SelectItem>
                                                <SelectItem value="none" className="text-xs">None</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <ColorInput label="Header BG" value={el.tableConfig.headerBg} onChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, headerBg: v } })} />
                                    <ColorInput label="Header Text" value={el.tableConfig.headerColor} onChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, headerColor: v } })} />
                                    <NumberInput label="Header Font" value={el.tableConfig.headerFontSize} onChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, headerFontSize: v } })} min={6} max={16} unit="pt" />
                                    <NumberInput label="Body Font" value={el.tableConfig.bodyFontSize} onChange={v => onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, bodyFontSize: v } })} min={6} max={16} unit="pt" />

                                    <SectionHeader title="Columns" />
                                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                                        {el.tableConfig.columns.map((col, index) => (
                                            <div key={index} className="flex items-center gap-1 text-[10px]">
                                                <div className="flex flex-col">
                                                    <button
                                                        className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                                                        disabled={index === 0}
                                                        onClick={() => {
                                                            const newCols = [...el.tableConfig!.columns];
                                                            [newCols[index - 1], newCols[index]] = [newCols[index], newCols[index - 1]];
                                                            onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, columns: newCols } });
                                                        }}
                                                    >▲</button>
                                                    <button
                                                        className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                                                        disabled={index === el.tableConfig!.columns.length - 1}
                                                        onClick={() => {
                                                            const newCols = [...el.tableConfig!.columns];
                                                            [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
                                                            onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, columns: newCols } });
                                                        }}
                                                    >▼</button>
                                                </div>
                                                <Input
                                                    value={col.label}
                                                    onChange={e => {
                                                        const newCols = [...el.tableConfig!.columns];
                                                        newCols[index] = { ...newCols[index], label: e.target.value };
                                                        onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, columns: newCols } });
                                                    }}
                                                    className="h-6 text-[10px] w-20 flex-1 px-1"
                                                />
                                                <Input
                                                    type="number"
                                                    value={col.width}
                                                    onChange={e => {
                                                        const newCols = [...el.tableConfig!.columns];
                                                        newCols[index] = { ...newCols[index], width: parseInt(e.target.value) || 10 };
                                                        onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, columns: newCols } });
                                                    }}
                                                    className="h-6 text-[10px] w-12"
                                                    min={3}
                                                    max={50}
                                                />
                                                <span className="text-muted-foreground">%</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 text-destructive"
                                                    onClick={() => {
                                                        const newCols = el.tableConfig!.columns.filter((_, i) => i !== index);
                                                        onUpdateElement(el.id, { tableConfig: { ...el.tableConfig!, columns: newCols } });
                                                    }}
                                                >
                                                    <IconTrash size={10} />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Select
                                        value={undefined}
                                        onValueChange={v => {
                                            const colDef = ITEM_TABLE_COLUMNS.find(c => c.key === v);
                                            if (colDef && el.tableConfig) {
                                                const newCol: TableColumn = {
                                                    key: colDef.key,
                                                    label: colDef.label,
                                                    width: colDef.defaultWidth,
                                                    align: colDef.align,
                                                    format: colDef.format,
                                                };
                                                onUpdateElement(el.id, { tableConfig: { ...el.tableConfig, columns: [...el.tableConfig.columns, newCol] } });
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="+ Add column..." /></SelectTrigger>
                                        <SelectContent>
                                            {ITEM_TABLE_COLUMNS.filter(c => !el.tableConfig!.columns.find(ec => ec.key === c.key)).map(col => (
                                                <SelectItem key={col.key} value={col.key} className="text-xs">{col.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}

                            {/* Totals-specific */}
                            {el.type === 'totals' && el.totalsConfig && (
                                <>
                                    <SectionHeader title="Totals Rows" />
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[11px]">Show Border</Label>
                                        <Switch
                                            checked={el.totalsConfig.showBorder}
                                            onCheckedChange={v => onUpdateElement(el.id, { totalsConfig: { ...el.totalsConfig!, showBorder: v } })}
                                            className="h-4 w-7"
                                        />
                                    </div>
                                    <div className="space-y-1 mt-1">
                                        {el.totalsConfig.rows.map((row, index) => (
                                            <div key={index} className="flex items-center gap-1 text-[10px]">
                                                <Input
                                                    value={row.label}
                                                    onChange={e => {
                                                        const newRows = [...el.totalsConfig!.rows];
                                                        newRows[index] = { ...newRows[index], label: e.target.value };
                                                        onUpdateElement(el.id, { totalsConfig: { ...el.totalsConfig!, rows: newRows } });
                                                    }}
                                                    className="h-6 text-[10px] flex-1"
                                                />
                                                <Button
                                                    variant={row.bold ? 'default' : 'outline'}
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => {
                                                        const newRows = [...el.totalsConfig!.rows];
                                                        newRows[index] = { ...newRows[index], bold: !newRows[index].bold };
                                                        onUpdateElement(el.id, { totalsConfig: { ...el.totalsConfig!, rows: newRows } });
                                                    }}
                                                >
                                                    <IconBold size={10} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 text-destructive"
                                                    onClick={() => {
                                                        const newRows = el.totalsConfig!.rows.filter((_, i) => i !== index);
                                                        onUpdateElement(el.id, { totalsConfig: { ...el.totalsConfig!, rows: newRows } });
                                                    }}
                                                >
                                                    <IconTrash size={10} />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        // ===== NO SELECTION =====
                        <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
                            <IconTextSize size={32} className="mb-2 opacity-30" />
                            <p className="text-xs">Select an element on the canvas to edit its properties</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
