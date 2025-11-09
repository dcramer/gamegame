declare module 'workflow/config' {
  export function defineConfig<T = unknown>(config: T): T;
}
