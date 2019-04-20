// @flow
import superagent from 'superagent'
import RPCError from './error.js'
import retry from 'async-retry'

export { RPCError }

export type RPCResponse = {
  response?: mixed,
  hash?: string,

  // error stuff
  error?: boolean,
  msg: string,
  trace?: string
}

export type RPCRequest = {
  fn: string,
  args: mixed[]
}

export default class RPCClient {
  dev: boolean = false
  baseUrl: string
  firstKnownHash: string
  recentHash: string
  cookieHeader: string

  headerMixins: {
    [x:string]: string
  } = {}

  rpc: {
    [fn: string]: (...args: any[]) => Promise<any>
  } = {}

  __rpcAvailable: Array<{
    name: string,
    args: number
  }> = []

  retry: boolean

  constructor ({ forceDev, baseUrl = '/api/_rpc', retry = false }: { forceDev?: boolean, baseUrl?: string, retry?: boolean } = {}) {
    this.baseUrl = (process.env.APP_URL || '') + baseUrl

    if (forceDev != null) {
      this.dev = forceDev
    } else {
      this.dev = process.env.NODE_ENV === 'development'
    }

    this.retry = retry

    this.rpc = new Proxy({}, {
      get: this.__rpcCall,
      has: this.__checkCall,
      ownKeys: this.__listCalls,
      delete: () => {}
    })

    if (this.dev) {
      this.updateCalls()
    }
  }

  withCookies = (h: string) => {
    this.cookieHeader = h
    return this.rpc
  }

  withBotAuth = (h: string) => {
    this.headerMixins['Authorization'] = `Bot ${h}`
    return this.rpc
  }

  async updateCalls () {
    // this is for development only. doing in prod is probably dumb.
    const rsp = await superagent.get(this.baseUrl)
    if (rsp.status !== 200) {
      console.error(rsp)
      return
    }

    const { hash, available } = rsp.body

    this.__rpcAvailable = available
    if (this.firstKnownHash == null) {
      this.firstKnownHash = hash
    }

    this.recentHash = hash

    // just kinda prefill. none of these get called anyway.
    // and don't matter in prod either.
    for (let { name } of available) {
      this.rpc[name] = async () => {}
    }
  }

  call (fn: string, ...args: any[]): mixed {
    // console.debug('rpc call:', { fn, args })
    if (this.retry) {
      return this.callWithRetry(fn, ...args)
    } else {
      return this.callAsNormal(fn, ...args)
    }
  }

  async callWithRetry (fn: string, ...args: any[]): mixed {
    return retry<mixed>(async (bail) => {
      try {
        return await this.callAsNormal(fn, ...args)
      } catch (e) {
        if (e instanceof RPCError) {
          bail(e)
        }
      }
    })
  }

  async callAsNormal (fn: string, ...args: any[]): mixed {
    const req: RPCRequest = { fn, args }
    const rq = superagent.post(this.baseUrl).set({ ...this.headerMixins })

    if (this.cookieHeader != null && this.cookieHeader !== '') {
      rq.cookies = this.cookieHeader
    }

    const rsp = await rq.send(req).ok(() => true)
    const body: RPCResponse = rsp.body

    // console.log(body)
    if (body.error === true) {
      console.error(body)
      throw RPCError.fromResponse(body, rsp.status)
    }

    if (body.hash != null) {
      if (this.firstKnownHash == null) {
        this.firstKnownHash = body.hash
      }

      this.recentHash = body.hash

      if (this.firstKnownHash !== this.recentHash) {
        this.updateCalls()
      }
    }

    return body.response
  }

  // PROXY HANDLERS
  // __rpcCall = (_: {}, fn: string) => this.call.bind(this, fn)
  __rpcCall = (_: {}, fn: string) => this.call.bind(this, fn)
  __checkCall = (_: {}, fn: string) => this.dev ? this.__listCalls(_).includes(fn) : true
  __listCalls = (_: {}): string[] => this.__rpcAvailable.map(x => x.name)
}
