import { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { IconAlertTriangle, IconPower } from '@tabler/icons-react';

export default function ExitConfirmDialog() {
    const [open, setOpen] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        // Register Tauri window close listener
        const setupTauriListener = async () => {
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const appWindow = getCurrentWindow();
                unlisten = await appWindow.onCloseRequested((event) => {
                    event.preventDefault();
                    setOpen(true);
                });
            } catch (err) {
                // Not in Tauri environment or failed to register
                console.debug('Tauri window close listener not attached:', err);
            }
        };

        setupTauriListener();

        // Listen for custom trigger event (e.g. from topbar/menu)
        const handleCustomTrigger = () => setOpen(true);
        window.addEventListener('open-exit-confirm', handleCustomTrigger);

        return () => {
            if (unlisten) {
                unlisten();
            }
            window.removeEventListener('open-exit-confirm', handleCustomTrigger);
        };
    }, []);

    const handleConfirmExit = async () => {
        setIsExiting(true);
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const appWindow = getCurrentWindow();
            await appWindow.destroy();
        } catch (err) {
            console.error('Tauri destroy window failed, falling back to window.close():', err);
            window.close();
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent className="sm:max-w-[420px] p-6 border border-border shadow-2xl rounded-xl">
                <AlertDialogHeader className="flex flex-col items-center text-center sm:text-left sm:flex-row sm:items-start gap-4">
                    <div className="p-3 rounded-full bg-destructive/10 text-destructive shrink-0">
                        <IconAlertTriangle size={28} />
                    </div>
                    <div className="space-y-1">
                        <AlertDialogTitle className="text-xl font-semibold tracking-tight text-foreground">
                            Exit Application?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                            Are you sure you want to close KolaBiz ERP? Any unsaved changes may be lost.
                        </AlertDialogDescription>
                    </div>
                </AlertDialogHeader>

                <AlertDialogFooter className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
                    <AlertDialogCancel
                        disabled={isExiting}
                        onClick={() => setOpen(false)}
                        className="w-full sm:w-auto cursor-pointer"
                    >
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isExiting}
                        onClick={(e) => {
                            e.preventDefault();
                            handleConfirmExit();
                        }}
                        className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors gap-2 cursor-pointer"
                    >
                        <IconPower size={16} />
                        <span>{isExiting ? 'Exiting...' : 'Yes, Exit'}</span>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
