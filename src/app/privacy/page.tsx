import * as React from 'react';
import Link from 'next/link';

export default function PrivacyPage() {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pt-12 pb-24">
            <main className="max-w-3xl mx-auto w-full px-6 space-y-12">
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    &larr; Back to Home
                </Link>

                <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
                    <p className="text-lg text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
                </div>

                <section className="space-y-6 text-muted-foreground">
                    <p>
                        Fluxbase ("we", "our", or "us") respects your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website and use our database services.
                    </p>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">1. Collection of your Information</h2>
                    <p>
                        We may collect information about you in a variety of ways. Information we may collect resides in your connection details, database schemas, and queries you actively orchestrate via our APIs. We do not peek into your restricted databases.
                    </p>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">2. Use of your Information</h2>
                    <p>
                        Having accurate information about you permits us to provide you with a smooth, efficient, and customized server-side experience. Specifically, we may use data collected to:
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                        <li>Create and manage your account.</li>
                        <li>Fulfill database transactions.</li>
                        <li>Notify you of updates to our service.</li>
                    </ul>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">3. Security</h2>
                    <p>
                        We use administrative and technical security measures such as secure network sockets to help protect your database interactions. While we have taken reasonable steps to secure the data you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable.
                    </p>
                </section>
            </main>
        </div>
    );
}
