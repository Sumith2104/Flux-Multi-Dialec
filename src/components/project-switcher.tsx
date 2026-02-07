
'use client';

import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import type { Project } from '@/lib/data';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext } from 'react';
import { ProjectContext } from '@/contexts/project-context';

type ProjectSwitcherProps = {
  headerTitle: string;
  orgName: string;
  projects: Project[];
  selectedProject: Project | null;
};

export function ProjectSwitcher({
  headerTitle,
  orgName,
  projects,
  selectedProject,
}: ProjectSwitcherProps) {
  const router = useRouter();
  const { setProject } = useContext(ProjectContext);

  const handleSelect = (project: Project | null) => {
    setProject(project);
    // The main app layout will handle the redirect automatically
    // based on the context change, so we remove the router.push calls.
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="text-lg font-semibold px-2">
          <span className="truncate max-w-[200px] sm:max-w-[300px]">
            {headerTitle}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{orgName}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => handleSelect(null)}>
            <div className="flex items-center w-full">
              <span className="flex-1">Switch Project</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.project_id}
              onSelect={() => handleSelect(project)}
            >
              <div className="flex items-center w-full">
                <span className="flex-1 truncate">{project.display_name}</span>
                {selectedProject?.project_id === project.project_id && (
                  <Check className="ml-2 h-4 w-4" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/projects/create">
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
