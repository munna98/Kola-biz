interface VoucherShortcutPanelProps {
    show: boolean;
}

export function VoucherShortcutPanel({ show }: VoucherShortcutPanelProps) {
    if (!show) return null;

    return (
        <div className="border-b bg-muted/50 px-5 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Alt+C</kbd>
                        <span>Create new Customer/Supplier</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+N</kbd>
                        <span>New item / line</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+S</kbd>
                        <span>Save voucher</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+K</kbd>
                        <span>Clear form</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+D</kbd>
                        <span>Delete row (in row)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Tab/Enter</kbd>
                        <span>Next field/row</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Shift+Tab</kbd>
                        <span>Previous field/row</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+↑/↓</kbd>
                        <span>Navigate rows (same column)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">/</kbd>
                        <span>Toggle shortcuts panel (Ctrl+/)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-background border rounded font-mono">Esc</kbd>
                        <span>Close this panel</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
