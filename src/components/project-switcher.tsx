
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

    // Explicitly navigate so Server Components see the new ?projectId
    if (project) {
      // If we want to stay on the same page but swap projects:
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/editor') || currentPath.startsWith('/database') || currentPath.startsWith('/api') || currentPath.startsWith('/query')) {
        router.push(`${currentPath}?projectId=${project.project_id}`);
      } else {
        // Fallback to routing to their dashboard overview
        router.push('/dashboard');
      }
    } else {
      router.push('/dashboard/projects');
    }
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
                <span className="flex-1 truncate pr-2">{project.display_name}</span>
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${project.dialect === 'mysql' ? 'bg-blue-500/10 text-blue-500' : 'bg-primary/10 text-primary'}`}>
                  {project.dialect === 'mysql' ? 'MySQL' : 'PG'}
                </span>
                {selectedProject?.project_id === project.project_id && (
                  <Check className="ml-2 h-4 w-4 shrink-0" />
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
