import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, setSidebarItems } from '../../store';
import { ALL_MENU_ITEMS, DEFAULT_SIDEBAR_ITEMS } from '../../lib/menu-items';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function SidebarSettingsPage() {
    const dispatch = useDispatch();
    const currentSidebarItems = useSelector((state: RootState) => state.app.sidebarItems);
    
    // Local state for the settings form
    const [selectedItems, setSelectedItems] = useState<string[]>(currentSidebarItems);

    const handleToggle = (id: string) => {
        setSelectedItems(prev => 
            prev.includes(id) 
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const handleSave = () => {
        dispatch(setSidebarItems(selectedItems));
        toast.success('Sidebar settings saved successfully');
    };

    const handleReset = () => {
        setSelectedItems(DEFAULT_SIDEBAR_ITEMS);
    };

    // Group items by category
    const groupedItems = ALL_MENU_ITEMS.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = [];
        }
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, typeof ALL_MENU_ITEMS>);

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Sidebar Settings</h1>
                    <p className="text-muted-foreground">Customize which items appear in your left sidebar navigation.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleReset}>Reset to Default</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {Object.entries(groupedItems).map(([category, items]) => (
                    <Card key={category}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">{category}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {items.map(item => (
                                <div key={item.id} className="flex items-center space-x-3">
                                    <Checkbox 
                                        id={`item-${item.id}`} 
                                        checked={selectedItems.includes(item.id)}
                                        onCheckedChange={() => handleToggle(item.id)}
                                    />
                                    <Label 
                                        htmlFor={`item-${item.id}`}
                                        className="flex items-center gap-2 cursor-pointer font-normal"
                                    >
                                        <item.icon size={16} className="text-muted-foreground" />
                                        {item.label}
                                    </Label>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ))}
            </div>
            </div>
        </div>
    );
}
