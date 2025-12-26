import { useRef, useEffect, useCallback } from 'react';

type RegisterOptions = {
    ignoreEnter?: boolean;
};

export function useDialog(
    open: boolean,
    onOpenChange: (open: boolean) => void,
    orderedFields: string[]
) {
    const refs = useRef<Record<string, HTMLElement | null>>({});

    const prevOpen = useRef(false);

    // Focus the first field when dialog opens
    useEffect(() => {
        // Only focus if the dialog was closed and is now open
        if (open && !prevOpen.current && orderedFields.length > 0) {
            setTimeout(() => {
                const firstField = refs.current[orderedFields[0]];
                firstField?.focus();
            }, 100);
        }
        prevOpen.current = open;
    }, [open, orderedFields]);

    const register = useCallback((name: string) => (el: HTMLElement | null) => {
        refs.current[name] = el;
    }, []);

    const focusNext = (field: string) => {
        const currentIndex = orderedFields.indexOf(field);
        if (currentIndex === -1) return;

        const nextField = orderedFields[currentIndex + 1];
        if (nextField && refs.current[nextField]) {
            setTimeout(() => {
                refs.current[nextField]?.focus();
            }, 50); // Small delay to allow popovers/selects to close
        } else if (currentIndex === orderedFields.length - 1) {
            refs.current[field]?.closest('form')?.requestSubmit();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, field: string, options?: RegisterOptions) => {
        // Escape to close
        if (e.key === 'Escape') {
            e.preventDefault();
            onOpenChange(false);
            return;
        }

        // Enter or ArrowDown to next field
        if ((e.key === 'Enter' && !options?.ignoreEnter) || e.key === 'ArrowDown') {
            e.preventDefault();
            focusNext(field);
        }

        // ArrowUp to previous field
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIndex = orderedFields.indexOf(field);
            if (currentIndex > 0) {
                const prevField = orderedFields[currentIndex - 1];
                refs.current[prevField]?.focus();
            }
        }
    };

    const handleSelectKeyDown = (e: React.KeyboardEvent, field: string) => {
        handleKeyDown(e, field);
    };

    // Helper for parsing number inputs
    const parseNumber = (value: string): number => {
        return value === '' ? 0 : parseFloat(value);
    };

    // Helper for formatting number outputs for inputs
    const formatNumber = (value: number | undefined | null): string => {
        return !value ? '' : value.toString();
    };

    return {
        register,
        handleKeyDown,
        handleSelectKeyDown,
        focusNext,
        parseNumber,
        formatNumber,
        refs // exposed in case direct access is needed
    };
}
