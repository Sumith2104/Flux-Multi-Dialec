"use client";

import { useState } from 'react';
import { RlsRule, RlsCompiler } from '@/lib/rls-compiler';
import { Shield, Plus, Check, Trash2, Code2 } from 'lucide-react';

interface VisualRlsBuilderProps {
    tables: string[];
    onApplyPolicy: (ddlStatements: string[]) => Promise<void>;
}

export function VisualRlsBuilder({ tables, onApplyPolicy }: VisualRlsBuilderProps) {
    const [selectedTable, setSelectedTable] = useState(tables[0] || '');
    const [action, setAction] = useState<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'>('ALL');
    const [roleName, setRoleName] = useState('authenticated');
    const [userColumn, setUserColumn] = useState('user_id');
    const [rules, setRules] = useState<RlsRule[]>([]);
    const [isApplying, setIsApplying] = useState(false);

    const handleAddOwnershipPolicy = () => {
        if (!selectedTable) return;
        const newRule = RlsCompiler.generateUserOwnershipPolicy(selectedTable, userColumn);
        setRules(prev => [...prev, newRule]);
    };

    const handleRemoveRule = (id: string) => {
        setRules(prev => prev.filter(r => r.id !== id));
    };

    const handleDeploy = async () => {
        if (rules.length === 0) return;
        setIsApplying(true);
        try {
            const allDdl = rules.flatMap(r => RlsCompiler.compilePgPolicy(r));
            await onApplyPolicy(allDdl);
            alert(`Successfully deployed ${rules.length} RLS policies!`);
        } catch (e: any) {
            alert(`Failed to deploy RLS policies: ${e.message || e}`);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold text-foreground">Visual RLS Policy Shield</h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                    Zero-Code Security
                </span>
            </div>

            {/* Config controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Table</label>
                    <select 
                        value={selectedTable} 
                        onChange={e => setSelectedTable(e.target.value)}
                        className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground"
                    >
                        {tables.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Role Scope</label>
                    <select 
                        value={roleName} 
                        onChange={e => setRoleName(e.target.value)}
                        className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground"
                    >
                        <option value="authenticated">authenticated (Logged-in users)</option>
                        <option value="anon">anon (Public visitors)</option>
                        <option value="public">PUBLIC (Everyone)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">User Foreign Key</label>
                    <input 
                        type="text"
                        value={userColumn}
                        onChange={e => setUserColumn(e.target.value)}
                        placeholder="e.g. user_id"
                        className="w-full h-9 px-3 text-xs rounded-md border border-border bg-background text-foreground"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
                <button
                    onClick={handleAddOwnershipPolicy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    <Plus size={14} /> Add User-Ownership Policy
                </button>
            </div>

            {/* Active Rules List */}
            {rules.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configured Policies ({rules.length})</h4>
                    <div className="space-y-2">
                        {rules.map(rule => (
                            <div key={rule.id} className="p-3 rounded-lg border border-border/80 bg-muted/40 flex items-center justify-between text-xs">
                                <div>
                                    <p className="font-semibold text-foreground">
                                        [{rule.action}] ON <span className="text-primary">{rule.tableName}</span> (Role: {rule.roleName})
                                    </p>
                                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                                        USING ({rule.usingExpression})
                                    </p>
                                </div>
                                <button 
                                    onClick={() => handleRemoveRule(rule.id)}
                                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={handleDeploy}
                        disabled={isApplying}
                        className="w-full mt-3 py-2 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        {isApplying ? <Check className="animate-spin" size={14} /> : <Code2 size={14} />}
                        Deploy {rules.length} Policies to Database
                    </button>
                </div>
            )}
        </div>
    );
}
