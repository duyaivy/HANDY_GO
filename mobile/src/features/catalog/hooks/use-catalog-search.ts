import * as React from 'react';
import { useCategories } from './use-categories';
import { useServices } from './use-services';

/**
 * useCatalogSearch
 *
 * Provides debounced search across both categories and services.
 * Server-side search is supported by the Catalog API (/api/v1/categories?search=
 * and /api/v1/services?search=).
 *
 * Debounces the search query to avoid excessive network requests.
 */
export function useCatalogSearch(rawQuery: string, debounceMs = 400) {
  const [debouncedQuery, setDebouncedQuery] = React.useState(rawQuery);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(rawQuery);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [rawQuery, debounceMs]);

  const trimmedQuery = debouncedQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  const categoriesResult = useCategories(
    isSearching ? { search: trimmedQuery, isActive: true, limit: 20 } : {},
  );

  const servicesResult = useServices(
    isSearching ? { search: trimmedQuery, isActive: true, limit: 20 } : { isActive: true, limit: 20 },
  );

  return {
    debouncedQuery: trimmedQuery,
    isSearching,
    categories: categoriesResult,
    services: servicesResult,
    isLoading: categoriesResult.isLoading || servicesResult.isLoading,
  };
}
