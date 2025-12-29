import React, { createContext, useState, useCallback } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { ConfirmOptions } from '@/hooks/useConfirm';

interface ConfirmDialogContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

interface ConfirmDialogState extends ConfirmOptions {
    open: boolean;
    resolve: (value: boolean) => void;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
    const [dialogState, setDialogState] = useState<ConfirmDialogState>({
        open: false,
        title: '',
        description: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        variant: 'default',
        resolve: () => { },
    });

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setDialogState({
                open: true,
                title: options.title,
                description: options.description,
                confirmText: options.confirmText || 'Confirm',
                cancelText: options.cancelText || 'Cancel',
                variant: options.variant || 'default',
                resolve,
            });
        });
    }, []);

    const handleConfirm = () => {
        dialogState.resolve(true);
        setDialogState((prev) => ({ ...prev, open: false }));
    };

    const handleCancel = () => {
        dialogState.resolve(false);
        setDialogState((prev) => ({ ...prev, open: false }));
    };

    return (
        <ConfirmDialogContext.Provider value={{ confirm }}>
            {children}
            <AlertDialog open={dialogState.open} onOpenChange={(open) => {
                if (!open) {
                    handleCancel();
                }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{dialogState.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {dialogState.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancel}>
                            {dialogState.cancelText}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirm}
                            className={
                                dialogState.variant === 'destructive'
                                    ? buttonVariants({ variant: 'destructive' })
                                    : ''
                            }
                        >
                            {dialogState.confirmText}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmDialogContext.Provider>
    );
}
