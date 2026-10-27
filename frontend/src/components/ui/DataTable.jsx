import { useId } from 'react';
import EmptyState from './EmptyState';
import LoadingState from './LoadingState';
import './DataTable.css';

export function DataTable({ caption, columns, rows, rowKey = 'id', loading = false, emptyTitle = 'No hay registros', emptyDescription }) {
  const captionId = useId();
  return <div className="ui-data-table" role="region" aria-labelledby={captionId} tabIndex={0} aria-busy={loading || undefined}>
    <table>
      <caption id={captionId}>{caption}</caption>
      <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.header}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey]}>{columns.map(column => {
        const Cell = column.rowHeader ? 'th' : 'td';
        return <Cell key={column.key} scope={column.rowHeader ? 'row' : undefined}>{column.render ? column.render(row) : row[column.key]}</Cell>;
      })}</tr>) : <tr><td colSpan={columns.length}>{loading ? <LoadingState>Consultando registros…</LoadingState> : <EmptyState title={emptyTitle} description={emptyDescription} />}</td></tr>}</tbody>
    </table>
  </div>;
}
export default DataTable;
