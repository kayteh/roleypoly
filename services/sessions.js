// @flow
import Service from './Service'
import { type AppContext } from '../Roleypoly'

type SessionData = {
  rolling: boolean,
  maxAge: number,
  changed: boolean
}

export default class SessionsService extends Service {
  Session: any
  constructor (ctx: AppContext) {
    super(ctx)
    this.Session = ctx.M.Session
  }

  async get (id: string, { rolling }: SessionData) {
    const user = await this.Session.findOne({ where: { id } })

    if (user === null) {
      return null
    }

    return user.data
  }

  async set (id: string, data: any, { maxAge, rolling, changed }: SessionData) {
    let session = await this.Session.findOne({ where: { id } })
    if (session === null) {
      session = this.Session.build({ id })
    }

    console.log(maxAge)

    session.data = data
    session.maxAge = maxAge

    return session.save()
  }

  async destroy (id: string) {
    const sess = await this.Session.findOne({ where: { id } })

    if (sess != null) {
      return sess.destroy()
    }
  }
}
