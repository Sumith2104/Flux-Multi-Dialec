import * as React from 'react';
import Link from 'next/link';

export default function ContactPage() {
    return (
        <div className="flex min-h-screen flex-col overflow-x-hidden bg-background pt-10 pb-16 text-foreground sm:pt-12 sm:pb-24">
            <main className="mx-auto w-full max-w-3xl space-y-8 px-5 sm:space-y-12 sm:px-6">
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    &larr; Back to Home
                </Link>

                <div className="space-y-3 sm:space-y-4">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Contact Us</h1>
                    <p className="text-base leading-7 text-muted-foreground sm:text-lg">
                        Have questions about Fluxbase? We would love to hear from you.
                    </p>
                </div>

                <section className="space-y-6">
                    <div className="card space-y-4 rounded-xl p-5 shadow-sm sm:p-8">
                        <h2 className="text-2xl font-semibold sm:text-3xl">Get in Touch</h2>
                        <p className="leading-7 text-muted-foreground">
                            For any support requests, feature ideas, or enterprise inquiries, feel free to reach out directly to the creator!
                        </p>
                        <div className="pt-4 space-y-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Creator</p>
                                <p className="text-lg">Sumith</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Direct Email</p>
                                <a href="mailto:sumithsumith4567890@gmail.com" className="break-anywhere text-base text-primary hover:underline sm:text-lg">
                                    sumithsumith4567890@gmail.com
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
