import type { PlatformProxy } from 'wrangler'
import type { Env } from './src/types'

type Cloudflare = Omit<PlatformProxy<Env>, 'dispose'>

type GetLoadContextArgs = {
  request: Request
  context: { cloudflare: Cloudflare }
}

declare module 'react-router' {
  interface AppLoadContext {
    cloudflare: Cloudflare
  }
}

export function getLoadContext({ context }: GetLoadContextArgs) {
  return context
}
