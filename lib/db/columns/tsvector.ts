import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

type TSVectorWeight = "A" | "B" | "C" | "D";

export class TSVector {
  value: string;
  weight: TSVectorWeight;

  constructor(value: string, weight: TSVectorWeight = "A") {
    this.value = value;
    this.weight = weight;
  }

  mapToDriverValue() {
    return sql`setweight(to_tsvector(${this.value}), ${this.weight})`;
  }
}

type TSVectorType = string | TSVector | TSVector[];

type TSVectorConfig = {
  sources?: string[];
};

export function tsvector<TData extends TSVectorType = string>(
  name: string,
  config?: TSVectorConfig
) {
  return customType<{
    // https://orm.drizzle.team/docs/column-types/pg#customizing-data-type
    // TODO: this is wrong if config isnt passed
    data: TData & { readonly __brand: unique symbol };
    config?: TSVectorConfig;
  }>({
    dataType(config) {
      if (!config?.sources || config.sources.length === 0) {
        return `tsvector`;
      }
      const sources = config.sources.join(" || ' ' || ");
      return `tsvector generated always as (to_tsvector('english', ${sources})) stored`;
    },

    toDriver(value: TData) {
      if (typeof value === "string") return sql`to_tsvector(${value})`;
      else if (Array.isArray(value))
        return sql.join(
          value.map((v) => v.mapToDriverValue()),
          sql` || ' ' || `
        );
      return value.mapToDriverValue();
    },
  })(name, config).default(sql`to_tsvector('english', '')`);
  // ^ default is a hack to fix types
}
