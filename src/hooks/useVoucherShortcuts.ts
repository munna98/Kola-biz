import { useEffect } from 'react';

interface UseVoucherShortcutsProps {
    onSave: () => void;
    onNewItem: () => void;
    onClear: () => void;
    onToggleShortcuts: () => void;
    onCloseShortcuts: () => void;
    showShortcuts: boolean;
}

export function useVoucherShortcuts({
    onSave,
    onNewItem,
    onClear,
    onToggleShortcuts,
    onCloseShortcuts,
    showShortcuts,
}: UseVoucherShortcutsProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + N: New item
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                onNewItem();
            }

            // Ctrl/Cmd + S: Save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                onSave();
            }

            // Ctrl/Cmd + K: Clear form
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                onClear();
            }

            // Ctrl/Cmd + /: Show shortcuts
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                onToggleShortcuts();
            }

            // Escape: Close shortcuts panel
            if (e.key === 'Escape' && showShortcuts) {
                onCloseShortcuts();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSave, onNewItem, onClear, onToggleShortcuts, onCloseShortcuts, showShortcuts]);
}
