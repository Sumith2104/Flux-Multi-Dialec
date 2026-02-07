
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
  const [value, setValue] = useState(defaultValue || "");

  const options = data.map(item => ({
    value: item[valueColumn],
    label: item[displayColumn] || item[valueColumn], // Fallback to value column if display is null
  }));

  return (
    <>
        <input type="hidden" name={name} value={value} />
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between col-span-3 font-normal"
                >
                {value
                    ? options.find((option) => option.value === value)?.label
                    : `Select from ${refTable?.table_name}...`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder={`Search ${refTable?.table_name}...`} />
                    <CommandEmpty>No matching record found.</CommandEmpty>
                     <ScrollArea className="h-64">
                        <CommandGroup>
                            {options.map((option) => (
                            <CommandItem
                                key={option.value}
                                value={option.value}
                                onSelect={(currentValue) => {
                                    setValue(currentValue === value ? "" : currentValue)
                                    setOpen(false)
                                }}
                            >
                                <Check
                                className={cn(
                                    "mr-2 h-4 w-4",
                                    value === option.value ? "opacity-100" : "opacity-0"
                                )}
                                />
                                {option.label}
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
