import * as React from 'react';
import Link from 'next/link';

export default function TermsPage() {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden pt-12 pb-24">
            <main className="max-w-3xl mx-auto w-full px-6 space-y-12">
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    &larr; Back to Home
                </Link>

                <div className="space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
                    <p className="text-lg text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
                </div>

                <section className="space-y-6 text-muted-foreground">
                    <p>
                        Welcome to Fluxbase. By using our services, you agree to be bound by these Terms of Service. Please read them carefully.
                    </p>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">1. Acceptance of Terms</h2>
                    <p>
                        By accessing or using Fluxbase, you agree to comply with and be bound by these Terms.
                    </p>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">2. Description of Service</h2>
                    <p>
                        Fluxbase provides a user interface and API for maintaining scalable databases. We are not responsible for any direct loss of data resulting from malformed queries you execute over the network onto your collections.
                    </p>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">3. User Responsibilities</h2>
                    <p>
                        You are responsible for safeguarding the password and API credentials that you use to access the Service. You agree not to disclose your password or secrets to any third party.
                    </p>

                    <h2 className="text-2xl font-semibold text-foreground pt-4">4. Limitations</h2>
                    <p>
                        In no event shall Fluxbase or its suppliers be liable for any damages arising out of the use or inability to use the materials on Fluxbase's software.
                    </p>
                </section>
            </main>
        </div>
    );
}
