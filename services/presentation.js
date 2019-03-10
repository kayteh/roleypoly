const Service = require('./Service')
const LRU = require('lru-cache')

class PresentationService extends Service {
  constructor (ctx) {
    super(ctx)
    this.M = ctx.M
    this.discord = ctx.discord

    this.cache = new LRU({ max: 500, maxAge: 100 * 60 * 5 })
  }

  serverSlug (server) {
    return {
      id: server.id,
      name: server.name,
      ownerID: server.ownerID,
      icon: server.icon
    }
  }

  async oldPresentableServers (collection, userId) {
    let servers = []

    for (let server of collection.array()) {
      const gm = server.members.get(userId)

      servers.push(await this.presentableServer(server, gm))
    }

    return servers
  }

  async presentableServers (collection, userId) {
    return collection.array().areduce(async (acc, server) => {
      const gm = server.members.get(userId)
      acc.push(await this.presentableServer(server, gm, { incRoles: false }))
      return acc
    })
  }

  async presentableServer (server, gm, { incRoles = true } = {}) {
    const sd = await this.ctx.server.get(server.id)

    return {
      id: server.id,
      gm: {
        nickname: gm.nickname,
        color: gm.displayHexColor
      },
      server: this.serverSlug(server),
      roles: (incRoles) ? (await this.rolesByServer(server, sd)).map(r => ({ ...r, selected: gm.roles.has(r.id) })) : [],
      message: sd.message,
      categories: sd.categories,
      perms: this.discord.getPermissions(gm)
    }
  }

  async rolesByServer (server) {
    return server.roles
      .filter(r => r.id !== server.id) // get rid of @everyone
      .map(r => ({
        id: r.id,
        color: r.color,
        name: r.name,
        position: r.position,
        safe: this.discord.safeRole(server.id, r.id)
      }))
  }
}

module.exports = PresentationService
