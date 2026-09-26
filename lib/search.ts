export const MIN_QUERY_LENGTH = 2;
export const SEARCH_GROUP_LIMIT = 8;

export type SearchScope = "artist" | "release" | "show";
export type SearchSort = "relevance" | "name" | "date";
export type SearchOrder = "asc" | "desc";

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  url: string;
}

export interface SearchResults {
  artists: SearchResultItem[];
  releases: SearchResultItem[];
  shows: SearchResultItem[];
}

export interface SearchResponse {
  query: string;
  scope: SearchScope[];
  sort: SearchSort;
  order: SearchOrder;
  results: SearchResults;
  total: number;
}

export interface SortState {
  sort: SearchSort;
  order: SearchOrder;
}

export interface SortAccessors<T> {
  text: (item: T) => string;
  date: (item: T) => string | null;
}

export const ALL_SCOPES: SearchScope[] = ["artist", "release", "show"];

export const DEFAULT_SORT_STATE: SortState = { sort: "name", order: "asc" };

const SCOPE_ALIASES: Record<string, SearchScope> = {
  artist: "artist",
  artists: "artist",
  release: "release",
  releases: "release",
  track: "release",
  tracks: "release",
  show: "show",
  shows: "show",
  evento: "show",
  eventos: "show",
};

const SORT_VALUES: SearchSort[] = ["relevance", "name", "date"];

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeQuery(value: string | null | undefined): string {
  return normalizeText((value ?? "").trim());
}

export function parseScopeParam(raw: string | null | undefined): SearchScope[] {
  if (!raw) return [...ALL_SCOPES];
  const parsed = raw
    .split(",")
    .map((part) => SCOPE_ALIASES[part.trim().toLowerCase()])
    .filter((scope): scope is SearchScope => Boolean(scope));
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [...ALL_SCOPES];
}

export function parseSortParam(raw: string | null | undefined): SearchSort {
  const value = (raw ?? "").trim().toLowerCase();
  return SORT_VALUES.includes(value as SearchSort) ? (value as SearchSort) : "relevance";
}

export function parseOrderParam(raw: string | null | undefined): SearchOrder {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "desc" || value === "descending" || value === "descendente") return "desc";
  if (value === "asc" || value === "ascending" || value === "ascendente") return "asc";
  return "asc";
}

export function parseSortState(sortParam: string | null | undefined, orderParam: string | null | undefined): SortState {
  return { sort: parseSortParam(sortParam), order: parseOrderParam(orderParam) };
}

export type ListSortKey = "name" | "date";

export interface ListSortState {
  sort: ListSortKey;
  order: SearchOrder;
}

export function toListSortState(state: SortState): ListSortState {
  return { sort: state.sort === "date" ? "date" : "name", order: state.order };
}

export function parseListSortParams(sortParam: string | null | undefined, orderParam: string | null | undefined): ListSortState {
  return toListSortState(parseSortState(sortParam, orderParam));
}

export function hitMatches(normalizedQuery: string, fields: Array<string | null | undefined>): boolean {
  return fields.some((field) => typeof field === "string" && normalizeText(field).includes(normalizedQuery));
}

function compareText<T>(a: T, b: T, accessors: SortAccessors<T>, order: SearchOrder): number {
  const result = accessors.text(a).localeCompare(accessors.text(b), "es", { sensitivity: "base" });
  return order === "desc" ? -result : result;
}

function compareDate<T>(a: T, b: T, accessors: SortAccessors<T>, order: SearchOrder): number {
  const dateA = accessors.date(a) ?? "";
  const dateB = accessors.date(b) ?? "";
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  if (dateA === dateB) return 0;
  const result = dateA < dateB ? -1 : 1;
  return order === "desc" ? -result : result;
}

export function sortList<T>(items: T[], state: SortState, accessors: SortAccessors<T>, normalizedQuery = ""): T[] {
  const sorted = [...items];
  if (state.sort === "relevance" && normalizedQuery) {
    sorted.sort((a, b) => {
      const prefixA = normalizeText(accessors.text(a)).startsWith(normalizedQuery) ? 0 : 1;
      const prefixB = normalizeText(accessors.text(b)).startsWith(normalizedQuery) ? 0 : 1;
      if (prefixA !== prefixB) return prefixA - prefixB;
      return compareText(a, b, accessors, "asc");
    });
    return sorted;
  }
  if (state.sort === "date") {
    sorted.sort((a, b) => compareDate(a, b, accessors, state.order));
    return sorted;
  }
  sorted.sort((a, b) => compareText(a, b, accessors, state.order));
  return sorted;
}
