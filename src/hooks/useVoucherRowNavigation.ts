import React from 'react';

interface UseVoucherRowNavigationProps {
    onRemoveItem: (index: number) => void;
    onAddItem: () => void;
}

export function useVoucherRowNavigation({
    onRemoveItem,
    onAddItem,
}: UseVoucherRowNavigationProps) {
    const handleRowKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
        const currentRow = e.currentTarget;
        const inputs = Array.from(currentRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
        const currentIndex = inputs.indexOf(document.activeElement as HTMLElement);

        // Ctrl/Cmd + D: Delete current row
        // Using e.code for physical key detection (more reliable across keyboard layouts)
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
            e.preventDefault();
            onRemoveItem(rowIndex);
            return;
        }

        const moveToNext = () => {
            if (currentIndex < inputs.length - 1) {
                // Move to next field in same row
                e.preventDefault();
                const nextInput = inputs[currentIndex + 1];
                nextInput?.focus();
                // Select input text if it's an input element
                if (nextInput instanceof HTMLInputElement) {
                    nextInput.select();
                }
            } else {
                // Last field - go to next row or add new
                e.preventDefault();
                const nextRow = currentRow.nextElementSibling;
                if (nextRow) {
                    const firstInput = nextRow.querySelector('input:not([disabled]), button:not([disabled])') as HTMLElement;
                    if (firstInput) {
                        firstInput.focus();
                        if (firstInput instanceof HTMLButtonElement) {
                            firstInput.click(); // Auto-open combobox
                        }
                    }
                } else {
                    onAddItem();
                    setTimeout(() => {
                        const newRow = currentRow.parentElement?.lastElementChild;
                        const firstInput = newRow?.querySelector('input:not([disabled]), button:not([disabled])') as HTMLElement;
                        if (firstInput) {
                            firstInput.focus();
                            if (firstInput instanceof HTMLButtonElement) {
                                firstInput.click(); // Auto-open combobox
                            }
                        }
                    }, 50);
                }
            }
        };

        // Tab OR Enter: Move to next field/row
        if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
            moveToNext();
        }

        // Shift+Tab: Move to previous field/row
        if (e.key === 'Tab' && e.shiftKey) {
            if (currentIndex === 0) {
                e.preventDefault();
                const prevRow = currentRow.previousElementSibling;
                if (prevRow) {
                    const prevInputs = Array.from(prevRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
                    const lastInput = prevInputs[prevInputs.length - 1];
                    lastInput?.focus();
                    if (lastInput instanceof HTMLInputElement) {
                        lastInput.select();
                    }
                }
            } else {
                // Navigate to previous field in same row
                e.preventDefault();
                const prevInput = inputs[currentIndex - 1];
                prevInput?.focus();
                if (prevInput instanceof HTMLInputElement) {
                    prevInput.select();
                }
            }
        }

        // Arrow keys for row navigation
        if (e.key === 'ArrowDown' && e.ctrlKey) {
            e.preventDefault();
            const nextRow = currentRow.nextElementSibling;
            if (nextRow) {
                const nextInputs = Array.from(nextRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
                const targetInput = nextInputs[currentIndex];
                if (targetInput) {
                    targetInput.focus();
                    if (targetInput instanceof HTMLInputElement) {
                        targetInput.select();
                    } else if (currentIndex === 0) {
                        // First column is often combobox/button, click to open
                        targetInput.click();
                    }
                }
            }
        }

        if (e.key === 'ArrowUp' && e.ctrlKey) {
            e.preventDefault();
            const prevRow = currentRow.previousElementSibling;
            if (prevRow) {
                const prevInputs = Array.from(prevRow.querySelectorAll('input:not([disabled]), button:not([disabled])')) as HTMLElement[];
                const targetInput = prevInputs[currentIndex];
                if (targetInput) {
                    targetInput.focus();
                    if (targetInput instanceof HTMLInputElement) {
                        targetInput.select();
                    } else if (currentIndex === 0) {
                        // First column is often combobox/button, click to open
                        targetInput.click();
                    }
                }
            }
        }
    };

    return { handleRowKeyDown };
}
