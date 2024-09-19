import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

export const tsvector = customType<{
  data: string;
  config: { sources: string[] };
}>({
  dataType(config) {
    if (config) {
      const sources = config.sources.join(" || ' ' || ");
      return `tsvector generated always as (to_tsvector('english', ${sources})) stored`;
    } else {
      return `tsvector`;
    }
  },
});
