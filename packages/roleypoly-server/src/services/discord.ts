// @flow
import Service from './Service'
import { AppContext } from '../Roleypoly'
import Eris, { Member, Role, Guild, Permission as ErisPermission } from 'eris'
import LRU from 'lru-cache'
import { OrderedSet, OrderedMap } from 'immutable'
import superagent from 'superagent'
import { AuthTokens } from './auth'
import { IFetcher } from './discord/types'
import RestFetcher from './discord/restFetcher'
import { oc } from 'ts-optchain'

type DiscordServiceConfig = {
  token: string,
  clientId: string,
  clientSecret: string,
  rootUsers: Set<string>
}

export type Permissions = {
  canManageRoles: boolean,
  isAdmin: boolean,
  faked?: boolean,
  __faked?: Permissions
}

type CachedRole = {
  id: string,
  position: number,
  color?: number
}

type OAuthRequestData = {
  grant_type: 'authorization_code',
  code: string
} | {
  grant_type: 'refresh_token',
  refresh_token: string
} | {
  grant_type: 'access_token',
  token: string
}

export type UserPartial = {
  id: string,
  username: string,
  discriminator: string,
  avatar: string
}

export type MemberExt = Member & {
  color?: number,
  __faked?: true
}

export default class DiscordService extends Service {
  static _guildExpiration = +(process.env.GUILD_INVALIDATION_TIME || 36e5)

  ctx: AppContext
  client: Eris.Client

  cfg: DiscordServiceConfig

  // a small cache of role data for checking viability
  ownRoleCache: LRU<string, CachedRole>
  topRoleCache: LRU<string, CachedRole>

  oauthCallback: string

  fetcher: IFetcher

  guilds: OrderedMap<string, Guild> = OrderedMap<string, Guild>()

  _lastGuildFetch: number
  constructor (ctx: AppContext) {
    super(ctx)
    this.ctx = ctx

    this.cfg = {
      rootUsers: new Set((process.env.ROOT_USERS || '').split(',')),
      token: process.env.DISCORD_BOT_TOKEN || '',
      clientId: process.env.DISCORD_CLIENT_ID || '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET || ''
    }

    this.oauthCallback = `${ctx.config.appUrl}/api/oauth/callback`

    this.ownRoleCache = new LRU()
    this.topRoleCache = new LRU()

    this.client = new Eris.Client(`Bot ${this.cfg.token}`, {
      restMode: true
    })

    this.fetcher = new RestFetcher(this)
    this.fetchGuilds(true).then(() => null).catch(e => this.log.error)
  }

  isRoot (id: string): boolean {
    return this.cfg.rootUsers.has(id)
  }

  getRelevantServers (user: string): OrderedMap<string, Guild> {
    return this.guilds.filter(guild => guild.members.has(user))
  }

  async gm (serverId: string, userId: string, { canFake }: { canFake: boolean } = { canFake: false }): Promise<Partial<MemberExt> | MemberExt | undefined> {
    const gm: Member | undefined = await this.fetcher.getMember(serverId, userId)
    if (gm === undefined && this.isRoot(userId)) {
      return this.fakeGm({ id: userId })
    }

    if (gm === undefined) {
      return undefined
    }

    const out: MemberExt = gm
    out.color = this.getHighestRole(gm).color
    return out
  }

  ownGm (serverId: string) {
    return this.gm(serverId, this.client.user.id)
  }

  fakeGm ({ id = '0', nick = '[none]', color = 0 }: Partial<MemberExt>): Partial<MemberExt> {
    return { id, nick, color, __faked: true, roles: [] }
  }

  getRoles (server: string) {
    const s = this.client.guilds.get(server)
    if (s === undefined) {
      return new Map<string, Eris.Role>()
    }

    return new Map(s.roles)
  }

  async getOwnPermHeight (server: Eris.Guild): Promise<number> {
    if (this.ownRoleCache.has(server.id)) {
      const r = this.ownRoleCache.get(server.id) as CachedRole // we know this exists.
      return r.position
    }

    const gm = oc(await this.ownGm(server.id))
    const g = gm.guild()
    if (g === undefined) {
      throw new Error('guild undefined.')
    }

    const rs = OrderedSet(gm.roles([])).map(id => g.roles.get(id) as Eris.Role)
    const r = rs.minBy(role => role.position) as Eris.Role

    this.ownRoleCache.set(server.id, {
      id: r.id,
      position: r.position
    })

    return r.position
  }

  getHighestRole (gm: MemberExt): Role {
    const trk = `${gm.guild.id}:${gm.id}`

    if (this.topRoleCache.has(trk)) {
      const r = gm.guild.roles.get((this.topRoleCache.get(trk) as CachedRole).id)
      if (r !== undefined) {
        return r
      }
    }

    const g = gm.guild
    const top = OrderedSet(gm.roles).map(id => g.roles.get(id) as Eris.Role).minBy(r => r.position) as Eris.Role
    this.topRoleCache.set(trk, {
      id: top.id,
      position: top.position,
      color: top.color
    })

    return top
  }

  calcPerms (permable: Role | Member): Permissions {
    const p: ErisPermission = (permable instanceof Role) ? permable.permissions : permable.permission
    return {
      isAdmin: p.has('administrator'),
      canManageRoles: p.has('manageRoles') || p.has('administrator')
    }
  }

  getPermissions (gm: Member): Permissions {
    const real = this.calcPerms(gm)

    if (this.isRoot(gm.id)) {
      return {
        isAdmin: true,
        canManageRoles: true,
        faked: true,
        __faked: real
      }
    }

    return real
  }

  async safeRole (server: string, role: string) {
    const r = this.getRoles(server).get(role)
    if (r === undefined) {
      throw new Error(`safeRole can't find ${role} in ${server}`)
    }

    return (await this.roleIsEditable(r)) && !this.calcPerms(r).canManageRoles
  }

  async roleIsEditable (role: Role): Promise<boolean> {
    // role will be LOWER than my own
    const ownPh = await this.getOwnPermHeight(role.guild)
    return ownPh > role.position
  }

  async oauthRequest (path: string, data: OAuthRequestData): Promise<AuthTokens> {
    const url = `https://discordapp.com/api/oauth2/${path}`
    try {
      const rsp = await superagent.post(url)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('User-Agent', 'DiscordBot (https://roleypoly.com, 2.x.x) OAuthHandler/1.0')
        .send({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          redirect_uri: this.oauthCallback,
          ...data
        })

      return rsp.body
    } catch (e) {
      this.log.error('oauthRequest failed', { e, path })
      throw e
    }
  }

  initializeOAuth (code: string) {
    return this.oauthRequest('token', {
      grant_type: 'authorization_code',
      code
    })
  }

  refreshOAuth ({ refreshToken }: { refreshToken: string }) {
    return this.oauthRequest('token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  }

  revokeOAuth ({ accessToken }: { accessToken: string }) {
    return this.oauthRequest('token/revoke', {
      grant_type: 'access_token',
      token: accessToken
    })
  }

  async getUserPartial (userId: string): Promise<UserPartial> {
    const u = await this.fetcher.getUser(userId)
    if (u === undefined) {
      this.log.debug('userPartial got a null user', userId, u)
      throw new Error('userPartial got a null user')
    }

    return {
      username: u.username,
      discriminator: u.discriminator,
      avatar: u.avatarURL,
      id: u.id
    }
  }

  async getUserFromToken (authToken: string): Promise<UserPartial> {
    const url = 'https://discordapp.com/api/v6/users/@me'
    try {
      const rsp = await superagent.get(url)
        .set('User-Agent', 'DiscordBot (https://roleypoly.com, 2.x.x) OAuthHandler/1.0')
        .set('Authorization', `Bearer ${authToken}`)

      return rsp.body
    } catch (e) {
      this.log.error('getUser error', e)
      throw e
    }
  }

  getAuthUrl (state: string): string {
    return `https://discordapp.com/oauth2/authorize?client_id=${this.cfg.clientId}&redirect_uri=${this.oauthCallback}&response_type=code&scope=identify&state=${state}`
  }

  // returns the bot join url with MANAGE_ROLES permission
  // MANAGE_ROLES is the only permission we really need.
  getBotJoinUrl (): string {
    return `https://discordapp.com/oauth2/authorize?client_id=${this.cfg.clientId}&scope=bot&permissions=268435456`
  }

  async fetchGuilds (force: boolean = false) {
    if (
      force ||
      this.guilds.isEmpty() ||
      this._lastGuildFetch + DiscordService._guildExpiration < Date.now()
    ) {
      const g = await this.fetcher.getGuilds()
      this.guilds = OrderedMap(g.reduce((acc, g) => ({ ...acc, [g.id]: g }), {}))
    }
  }

  async guild (id: string, invalidate: boolean = false): Promise<Guild | undefined> {
    // fetch if needed
    await this.fetchGuilds()

    // do we know about it?
    // (also don't get this if we're invalidating)
    if (invalidate === false && this.guilds.has(id)) {
      return this.guilds.get(id) as Eris.Guild
    }

    // else let's fetch and cache.
    const g = await this.fetcher.getGuild(id)
    if (g !== undefined) {
      this.guilds = this.guilds.set(g.id, g)
    }

    return g
  }

  async issueChallenge (author: string) {
    // Create a challenge
    const chall = await this.ctx.auth.createDMChallenge(author)

    const randomLines = [
      '🐄 A yellow cow is only as bright as it lets itself be. ✨',
      '‼ **Did you know?** On this day, at least one second ago, you were right here!',
      '<:AkkoC8:437428070849314816> *Reticulating splines...*',
      'Also, you look great today <:YumekoWink:439519270376964107>',
      'btw, ur bright like a <:diamond:544665968631087125>',
      `🌈 psst! pssssst! I'm an expensive bot, would you please spare some change? <https://ko-fi.com/roleypoly>`,
      '📣 have suggestions? wanna help out? join my discord! <https://discord.gg/PWQUVsd>\n*(we\'re nice people, i swear!)*',
      `🤖 this bot is at least ${Math.random() * 100}% LIT 🔥`,
      '💖 wanna contribute to these witty lines? <https://discord.gg/PWQUVsd> suggest them on our discord!',
      '🛠 I am completely open source, check me out!~ <https://github.com/kayteh/roleypoly>'
    ]

    return ([
      '**Hey there!** <a:StockKyaa:435353158462603266>',
      '',
      `Use this secret code: **${chall.human}**`,
      `Or, click here: <${this.ctx.config.appUrl}/magic/${chall.magic}>`,
      '',
      'This code will self-destruct in 1 hour.',
      '---',
      randomLines[Math.floor(Math.random() * randomLines.length)]
    ].join('\n'))
  }

  async canManageRoles (server: string, user: string): Promise<boolean> {
    const gm = await this.gm(server, user) as Member | undefined
    if (gm === undefined) {
      return false
    }

    return this.getPermissions(gm).canManageRoles
  }

  async isMember (server: string, user: string): Promise<boolean> {
    return await this.gm(server, user) !== undefined
  }

  async isValidUser (user: string): Promise<boolean> {
    const u = await this.fetcher.getUser(user)
    if (u !== undefined) {
      return true
    }

    return false
  }
}
