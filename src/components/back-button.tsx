
'use client';

import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { ArrowLeft } from 'lucide-react';

export function BackButton() {
    const router = useRouter();

    const goBack = () => {
        // We go back to dashboard as a default
        router.push('/dashboard');
    }

    return (
        <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back</span>
        </Button>
    )
}
