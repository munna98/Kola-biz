import {
    IconTextSize,
    IconDatabase,
    IconPhoto,
    IconTable,
    IconLine,
    IconCalculator,
    IconSquare,
    IconBuildingBank,
    IconFileText,
    IconSignature,
    IconLayoutList,
    IconUser,
    IconBuilding,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ElementType, DesignerElement } from './types';

interface ElementToolbarProps {
    onAddElement: (type: ElementType, overrides?: Partial<DesignerElement>) => void;
}

interface ToolbarItem {
    type: ElementType;
    label: string;
    icon: React.ReactNode;
    overrides?: Partial<DesignerElement>;
}

interface ToolbarSection {
    title: string;
    items: ToolbarItem[];
}

const TOOLBAR_SECTIONS: ToolbarSection[] = [
    {
        title: 'Basic Elements',
        items: [
            { type: 'text', label: 'Text Label', icon: <IconTextSize size={16} /> },
            { type: 'field', label: 'Data Field', icon: <IconDatabase size={16} /> },
            { type: 'image', label: 'Image/Logo', icon: <IconPhoto size={16} /> },
            { type: 'divider', label: 'Divider Line', icon: <IconLine size={16} /> },
            { type: 'shape', label: 'Box/Shape', icon: <IconSquare size={16} /> },
        ],
    },
    {
        title: 'Invoice Sections',
        items: [
            {
                type: 'text',
                label: 'Company Name',
                icon: <IconBuilding size={16} />,
                overrides: {
                    type: 'field',
                    fieldBinding: 'company.name',
                    label: 'Company Name',
                    styles: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', padding: 1, lineHeight: 1.4 },
                    width: 190, height: 10,
                },
            },
            {
                type: 'field',
                label: 'Bill To Section',
                icon: <IconUser size={16} />,
                overrides: {
                    fieldBinding: 'party.name',
                    label: 'Party Name',
                    styles: { fontSize: 11, fontWeight: 'bold', padding: 1, lineHeight: 1.4 },
                    width: 80, height: 8,
                },
            },
            {
                type: 'table',
                label: 'Items Table',
                icon: <IconTable size={16} />,
            },
            {
                type: 'totals',
                label: 'Totals Block',
                icon: <IconCalculator size={16} />,
            },
            {
                type: 'field',
                label: 'Amount in Words',
                icon: <IconLayoutList size={16} />,
                overrides: {
                    fieldBinding: 'grand_total_words',
                    label: 'Amount in Words',
                    styles: { fontSize: 9, fontStyle: 'italic', padding: 1, lineHeight: 1.4 },
                    width: 190, height: 8,
                },
            },
        ],
    },
    {
        title: 'Footer Elements',
        items: [
            {
                type: 'field',
                label: 'Bank Details',
                icon: <IconBuildingBank size={16} />,
                overrides: {
                    fieldBinding: 'bank.name',
                    label: 'Bank Name',
                    styles: { fontSize: 9, padding: 1, lineHeight: 1.4 },
                    width: 80, height: 30,
                },
            },
            {
                type: 'field',
                label: 'Terms & Conditions',
                icon: <IconFileText size={16} />,
                overrides: {
                    fieldBinding: 'terms_and_conditions',
                    label: 'Terms & Conditions',
                    styles: { fontSize: 8, padding: 1, lineHeight: 1.4 },
                    width: 100, height: 20,
                },
            },
            {
                type: 'text',
                label: 'Signature Block',
                icon: <IconSignature size={16} />,
                overrides: {
                    content: 'Authorized Signatory',
                    label: 'Signature',
                    styles: { fontSize: 9, textAlign: 'center', padding: 1, lineHeight: 1.4, border: '1px solid #ddd' },
                    width: 50, height: 25,
                },
            },
        ],
    },
];

export default function ElementToolbar({ onAddElement }: ElementToolbarProps) {
    return (
        <div className="w-[200px] border-r bg-card flex flex-col shrink-0">
            <div className="p-3 border-b">
                <h3 className="text-sm font-semibold">Elements</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Click to add to canvas</p>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-4">
                    {TOOLBAR_SECTIONS.map(section => (
                        <div key={section.title}>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1.5">
                                {section.title}
                            </p>
                            <div className="space-y-0.5">
                                {section.items.map(item => (
                                    <Button
                                        key={item.label}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start h-8 text-xs gap-2 font-normal"
                                        onClick={() => onAddElement(
                                            item.overrides?.type || item.type,
                                            item.overrides
                                        )}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
