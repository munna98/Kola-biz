import { useDispatch } from 'react-redux';
import { setActiveSection } from '@/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShoppingBag, Truck, CreditCard, Wallet } from 'lucide-react';

export default function QuickActions() {
    const dispatch = useDispatch();

    const actions = [
        { id: 'sales', label: 'New Sale', icon: ShoppingBag },
        { id: 'purchase', label: 'New Purchase', icon: Truck },
        { id: 'payments', label: 'New Payment', icon: CreditCard },
        { id: 'receipts', label: 'New Receipt', icon: Wallet },
    ];

    return (
        <Card className="border-t-4 border-t-muted">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg">Quick Actions</h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    Create New Voucher
                </p>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                    {actions.map(({ id, label, icon: Icon }) => (
                        <Button
                            key={id}
                            onClick={() => dispatch(setActiveSection(id))}
                            variant="outline"
                            className="h-auto py-3 flex-col gap-2"
                        >
                            <Icon size={20} />
                            <span className="text-xs font-medium">{label}</span>
                        </Button>
                    ))}
                </div>
            </div>
        </Card>
    );
}
