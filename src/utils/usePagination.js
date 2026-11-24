import { useMemo, useState } from 'react';

/**
 * Client-side pagination over an already filtered list. The page is clamped
 * when the list shrinks (e.g. after filtering), so it never points past the end.
 */
export function usePagination(items, initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize],
  );

  const setPageSize = (size) => {
    setPageSizeState(size);
    setPage(1);
  };

  return {
    pageItems,
    paginationProps: {
      currentPage,
      totalPages,
      totalItems: items.length,
      pageSize,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    },
    resetPage: () => setPage(1),
  };
}
