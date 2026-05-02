
"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AlertOptions {
    title: string;
    description: ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive' | 'info';
}

interface ValidAlertState extends AlertOptions {
    isOpen: boolean;
    resolve: (value: boolean) => void;
    isLoading?: boolean;
}

interface GlobalAlertContextType {
    showAlert: (options: AlertOptions) => Promise<boolean>;
    showConfirm: (message: string, options?: Partial<AlertOptions>) => Promise<boolean>;
}

const GlobalAlertContext = createContext<GlobalAlertContextType | undefined>(undefined);

export function useGlobalAlert() {
    const context = useContext(GlobalAlertContext);
    if (!context) {
        throw new Error('useGlobalAlert must be used within a GlobalAlertProvider');
    }
    return context;
}

export function GlobalAlertProvider({ children }: { children: ReactNode }) {
    const [alertState, setAlertState] = useState<ValidAlertState | null>(null);

    const showAlert = useCallback((options: AlertOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setAlertState({
                ...options,
                isOpen: true,
                resolve,
            });
        });
    }, []);

    const showConfirm = useCallback((message: string, options?: Partial<AlertOptions>): Promise<boolean> => {
        return showAlert({
            title: options?.title || 'Confirm Action',
            description: message,
            confirmText: options?.confirmText || 'Confirm',
            cancelText: options?.cancelText || 'Cancel',
            variant: options?.variant || 'default'
        });
    }, [showAlert]);

    const handleClose = (result: boolean) => {
        if (alertState) {
            alertState.resolve(result);
            setAlertState(null);
        }
    };

    const isDestructive = alertState?.variant === 'destructive';

    return (
        <GlobalAlertContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {alertState && (
                <AlertDialog open={alertState.isOpen} onOpenChange={(open) => !open && handleClose(false)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-foreground">{alertState.title}</AlertDialogTitle>
                            <AlertDialogDescription className="text-muted-foreground">
                                {alertState.description}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => handleClose(false)} className="border-border/70 bg-transparent text-foreground/85 hover:bg-secondary/40 hover:text-white">
                                {alertState.cancelText || 'Cancel'}
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => handleClose(true)}
                                className={isDestructive ? "bg-red-500/80 hover:bg-red-500 text-white border-none" : "bg-orange-500 hover:bg-orange-600 text-white border-none"}
                            >
                                {alertState.confirmText || 'Continue'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </GlobalAlertContext.Provider>
    );
}
