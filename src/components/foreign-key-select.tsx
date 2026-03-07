
'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from './ui/scroll-area';
import { type Table as DbTable } from '@/lib/data';

interface ForeignKeySelectProps {
    name: string;
    data: any[];
    refTable: DbTable | undefined;
    valueColumn: string;
    displayColumn: string;
    defaultValue?: string;
}

export function ForeignKeySelect({
    name,
    data,
    refTable,
    valueColumn,
    displayColumn,
    defaultValue
}: ForeignKeySelectProps) {
    const [open, setOpen] = useState(false)

    const options = data.map(item => ({
        value: String(item[valueColumn] ?? ''),   // The actual UUID/ID to submit
        label: String(item[displayColumn] ?? item[valueColumn] ?? ''),  // Human-readable name
    }));

    // Only accept defaultValue if it actually matches a known option value (UUID),
    // prevents corrupted string values (e.g. "Sumith") from being silently re-submitted.
    const isValidDefault = defaultValue
        ? options.some(opt => opt.value === defaultValue)
        : false;

    const [selectedValue, setSelectedValue] = useState(isValidDefault ? (defaultValue || "") : "");

    const selectedLabel = options.find(opt => opt.value === selectedValue)?.label;

    return (
        <>
            {/* Always submits the UUID value, never the display label */}
            <input type="hidden" name={name} value={selectedValue} />
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "w-full justify-between col-span-3 font-normal",
                            !selectedValue && "text-muted-foreground"
                        )}
                    >
                        {selectedLabel || `Select from ${refTable?.table_name || 'table'}...`}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        {/* Search works by label (name), not UUID */}
                        <CommandInput placeholder={`Search ${refTable?.table_name || ''}...`} />
                        <CommandEmpty>No matching record found.</CommandEmpty>
                        <ScrollArea className="h-64">
                            <CommandGroup>
                                {options.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.label}   // cmdk uses this for search filtering — use human-readable label!
                                        onSelect={() => {
                                            // Directly use option.value (UUID) — never rely on cmdk's currentValue
                                            setSelectedValue(selectedValue === option.value ? "" : option.value)
                                            setOpen(false)
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedValue === option.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <span>{option.label}</span>
                                        <span className="ml-auto text-xs text-muted-foreground opacity-50 truncate max-w-[100px]">
                                            {option.value}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </ScrollArea>
                    </Command>
                </PopoverContent>
            </Popover>
        </>
    )
}
