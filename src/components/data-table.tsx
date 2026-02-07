
'use client';

import * as React from 'react';
import { DataGrid, type GridColDef, type GridRowSelectionModel, type GridPaginationModel } from '@mui/x-data-grid';
import Paper from '@mui/material/Paper';

interface DataTableProps {
  columns: GridColDef[];
  rows: any[];
  rowCount: number;
  loading: boolean;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  selectionModel?: GridRowSelectionModel;
  onRowSelectionModelChange?: (selectionModel: GridRowSelectionModel) => void;
}

export function DataTable({
  columns,
  rows,
  rowCount,
  loading,
  paginationModel,
  onPaginationModelChange,
  selectionModel,
  onRowSelectionModelChange,
}: DataTableProps) {
  return (
    <Paper
      sx={{
        height: '70vh',
        width: '100%',
        backgroundColor: 'hsla(0, 0%, 100%, 0.1)',
        backdropFilter: 'blur(16px)',
        color: 'hsl(var(--foreground))',
        '& .MuiDataGrid-root': {
          border: 'none',
          color: 'inherit',
          backgroundColor: 'transparent',
        },
        '& .MuiDataGrid-cell': {
          borderBottom: '1px solid hsl(var(--border))',
          color: 'inherit',
        },
        '& .MuiDataGrid-columnHeaders': {
          backgroundColor: '#ffffff',
          borderBottom: '1px solid hsl(var(--border))',
          color: '#000000',
        },
        '& .MuiDataGrid-columnHeaderTitle': {
          fontWeight: 'bold',
          color: '#000000',
        },
        '& .MuiDataGrid-footerContainer': {
          borderTop: '1px solid hsl(var(--border))',
          color: 'hsl(var(--muted-foreground))',
        },
        '& .MuiTablePagination-root': {
          color: 'hsl(var(--muted-foreground))',
        },
        '& .MuiCheckbox-root': {
          color: 'hsl(var(--primary))',
        },
        '& .MuiCheckbox-root.Mui-checked': {
          color: 'hsl(var(--primary))',
        },
        '& .MuiDataGrid-iconButtonContainer > .MuiButtonBase-root': {
          color: 'hsl(var(--foreground))',
        },
        '& .MuiDataGrid-actionsCell .MuiIconButton-root': {
          color: 'hsl(var(--foreground))',
        },
        '& .MuiDataGrid-row': {
          cursor: 'pointer',
          color: 'hsl(var(--foreground))',
        },
        '& .MuiDataGrid-row:hover': {
          backgroundColor: 'hsl(var(--muted) / 0.5)',
        },
        '& .MuiDataGrid-row.Mui-selected': {
          backgroundColor: 'hsl(var(--accent)) !important',
          '&:hover': {
            backgroundColor: 'hsl(var(--accent)) !important',
          }
        },
        '& .MuiDataGrid-overlay': {
          backgroundColor: 'hsl(var(--card) / 0.8)',
        },
      }}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        pagination
        paginationMode="server"
        rowCount={rowCount}
        loading={loading}
        pageSizeOptions={[20, 50, 100]}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        checkboxSelection
        disableRowSelectionOnClick
        onRowSelectionModelChange={onRowSelectionModelChange}
        rowSelectionModel={selectionModel}
      />
    </Paper >
  );
}

