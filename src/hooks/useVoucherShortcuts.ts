import { useEffect } from 'react';

interface UseVoucherShortcutsProps {
    onSave: () => void;
    onNewItem: () => void;
    onClear: () => void;
    onToggleShortcuts: () => void;
    onCloseShortcuts: () => void;
    showShortcuts: boolean;
    onQuickEntry?: () => void; // Optional: Ctrl+Q for quick payment/receipt dialog
}

export function useVoucherShortcuts({
    onSave,
    onNewItem,
    onClear,
    onToggleShortcuts,
    onCloseShortcuts,
    showShortcuts,
    onQuickEntry,
}: UseVoucherShortcutsProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Use e.code for physical key detection (more reliable across keyboard layouts)
            // and e.key.toLowerCase() for special keys that vary

            // Ctrl/Cmd + N: New item
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') {
                e.preventDefault();
                onNewItem();
            }

            // Ctrl/Cmd + S: Save
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
                e.preventDefault();
                onSave();
            }

            // Ctrl/Cmd + K: Clear form
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
                e.preventDefault();
                onClear();
            }

            // Ctrl/Cmd + Q: Quick Entry Dialog (Payment/Receipt)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyQ' && onQuickEntry) {
                e.preventDefault();
                onQuickEntry();
            }

            // Ctrl/Cmd + /: Show shortcuts (Slash key)
            if ((e.ctrlKey || e.metaKey) && e.code === 'Slash') {
                e.preventDefault();
                onToggleShortcuts();
            }

            // Escape: Close shortcuts panel
            if (e.code === 'Escape' && showShortcuts) {
                onCloseShortcuts();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSave, onNewItem, onClear, onToggleShortcuts, onCloseShortcuts, showShortcuts, onQuickEntry]);
}
