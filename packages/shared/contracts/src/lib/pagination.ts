/** 分页元数据，随 envelope 的 meta 字段返回 */
export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
}

/** 列表接口的分页数据负载 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
