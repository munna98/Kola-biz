import { useEffect, useRef } from 'react';

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
    const handlersRef = useRef({
        onSave,
        onNewItem,
        onClear,
        onToggleShortcuts,
        onCloseShortcuts,
        showShortcuts,
        onQuickEntry,
    });

    // Update refs when props change (without recreating the listener)
    useEffect(() => {
        handlersRef.current = {
            onSave,
            onNewItem,
            onClear,
            onToggleShortcuts,
            onCloseShortcuts,
            showShortcuts,
            onQuickEntry,
        };
    }, [onSave, onNewItem, onClear, onToggleShortcuts, onCloseShortcuts, showShortcuts, onQuickEntry]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const handlers = handlersRef.current;

            // Use e.code for physical key detection (more reliable across keyboard layouts)
            // and e.key.toLowerCase() for special keys that vary

            // Ctrl/Cmd + N: New item
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') {
                e.preventDefault();
                handlers.onNewItem();
            }

            // Ctrl/Cmd + S: Save
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
                e.preventDefault();
                handlers.onSave();
            }

            // Ctrl/Cmd + K: Clear form
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
                e.preventDefault();
                handlers.onClear();
            }

            // Ctrl/Cmd + Q: Quick Entry Dialog (Payment/Receipt)
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyQ' && handlers.onQuickEntry) {
                e.preventDefault();
                handlers.onQuickEntry();
            }

            // Ctrl/Cmd + /: Show shortcuts (Slash key)
            if ((e.ctrlKey || e.metaKey) && e.code === 'Slash') {
                e.preventDefault();
                handlers.onToggleShortcuts();
            }

            // Escape: Close shortcuts panel
            if (e.code === 'Escape' && handlers.showShortcuts) {
                handlers.onCloseShortcuts();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []); // Empty dependency array - listener is created only once
}
