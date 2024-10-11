import { customType } from "drizzle-orm/pg-core";

export const tsvector = customType<{
  // https://orm.drizzle.team/docs/column-types/pg#customizing-data-type
  data: string & { readonly __brand: unique symbol };
  config: { sources: string[] };
}>({
  dataType(config) {
    if (!config) throw new Error("config is required");
    const sources = config.sources.join(" || ' ' || ");
    return `tsvector generated always as (to_tsvector('english', ${sources})) stored`;
  },
});
