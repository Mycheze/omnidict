import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PaginationPage } from '@/lib/types';

interface PaginationGridProps {
  pages: PaginationPage[];
  currentPage: number;
  onPageSelect: (page: number) => void;
  className?: string;
}

export function PaginationGrid({ 
  pages, 
  currentPage, 
  onPageSelect,
  className 
}: PaginationGridProps) {
  if (!pages || pages.length <= 1) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-sm text-center text-muted-foreground mb-4">
        Jump to page:
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {pages.map((page) => {
          // Format label: "Ab - Ac" taking first 2 chars
          // If start and end are same (or close), might just show one
          const start = page.startHeadword.substring(0, 2);
          const end = page.endHeadword.substring(0, 2);
          const label = start.toLowerCase() === end.toLowerCase() 
            ? start 
            : `${start}-${end}`;

          return (
            <Button
              key={page.page}
              variant={currentPage === page.page ? "default" : "outline"}
              size="sm"
              onClick={() => onPageSelect(page.page)}
              title={`${page.startHeadword} - ${page.endHeadword}`}
              className={cn(
                "w-full text-xs h-8",
                currentPage === page.page && "bg-primary text-primary-foreground"
              )}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
