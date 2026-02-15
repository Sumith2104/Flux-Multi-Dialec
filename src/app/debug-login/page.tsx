
'use client';

import { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function DebugLogin() {
    const [logs, setLogs] = useState<string[]>([]);

    const log = (msg: string, data?: any) => {
        const text = `${new Date().toISOString()} - ${msg} ${data ? JSON.stringify(data) : ''}`;
        setLogs(prev => [...prev, text]);
        console.log(msg, data);
    };

    const handleLogin = async () => {
        try {
            log('Starting Firebase Login...');
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            log('Firebase Login Success', result.user.uid);

            log('Getting ID Token...');
            const idToken = await result.user.getIdToken();
            log('Got ID Token (first 20 chars)', idToken.substring(0, 20));

            log('Sending to /api/auth/login...');
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, type: 'login' })
            });

            log(`Server Response Status: ${res.status}`);
            const data = await res.json();
            log('Server Response Body:', data);

        } catch (e: any) {
            log('ERROR:', e.message);
        }
    };

    return (
        <div className="p-10 font-mono text-sm">
            <h1 className="text-2xl font-bold mb-4">Debug Login Flow</h1>
            <button
                onClick={handleLogin}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mb-6"
            >
                Test Login (Google)
            </button>

            <div className="bg-gray-900 text-green-400 p-4 rounded min-h-[300px] whitespace-pre-wrap">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
}
