// @flow
import Eris, { type Message, type TextChannel } from 'eris'
import logger from './logger.js'
import RPCClient from '@roleypoly/rpc-client'
import randomEmoji from './random-emoji'
import DMCommands from './commands/dm'
import TextCommands from './commands/text'
import RootCommands from './commands/root'
import type { Command } from './commands/_types'
import retry from 'async-retry'
const log = logger(__filename)

export type BotConfig = $Shape<{
  sharedSecret: string,
  botToken: string,
  rootUsers: Set<string>,
  appUrl: string,
  logChannel: string
}>

export default class Bot {
  config: BotConfig = {
    sharedSecret: process.env.SHARED_SECRET || '',
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    rootUsers: new Set((process.env.ROOT_USERS || '').split(',')),
    appUrl: process.env.APP_URL || '',
    logChannel: process.env.LOG_CHANNEL || ''
  }

  client: Eris

  $RPC: RPCClient

  rpc: *

  commandCheck: RegExp

  constructor (config: BotConfig = {}) {
    if (config != null) {
      this.config = {
        ...this.config,
        ...config
      }
    }

    this.client = new Eris(this.config.botToken, {
      disableEveryone: true,
      maxShards: 'auto',
      messageLimit: 10,
      disableEvents: {
        CHANNEL_PINS_UPDATE: true,
        USER_SETTINGS_UPDATE: true,
        USER_NOTE_UPDATE: true,
        RELATIONSHIP_ADD: true,
        RELATIONSHIP_REMOVE: true,
        GUILD_BAN_ADD: true,
        GUILD_BAN_REMOVE: true,
        TYPING_START: true,
        MESSAGE_UPDATE: true,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
        VOICE_STATE_UPDATE: true
      }
    })

    this.$RPC = new RPCClient({ forceDev: false, retry: true })
    this.rpc = this.$RPC.withBotAuth(this.config.sharedSecret)
    this.botPing()

    if (this.config.sharedSecret === '') {
      log.fatal('configuration incomplete: SHARED_SECRET missing')
    }

    if (this.config.botToken === '') {
      log.fatal('configuration incomplete: DISCORD_BOT_TOKEN missing')
    }

    // <@botid> AND <@!botid> both are valid mentions.
    retry(() => { this.commandCheck = new RegExp(`^<@!?${this.client.user.id}>`) })
  }

  isRoot (u: string) {
    return this.config.rootUsers.has(u)
  }

  sendErrorLog (msg: Message, err: Error) {
    if (this.config.logChannel === '') return

    this.client.createMessage(
      this.config.logChannel,
      `❌ **Command errored:**\nUser > <@${msg.author.id}> (${msg.author.username}#${msg.author.discriminator}) \nChannel > <#${msg.channel.id}> in ${(msg.channel: any)?.guild?.name || 'DM'}\nInput > \`${msg.content}\`\nTrace > \`\`\`${err.stack}\`\`\``
    )
  }

  botPing = async () => {
    try {
      await this.rpc.botPing()
    } catch (e) {
      log.fatal('bot failed to connect to RPC server.', e)
    }
  }

  buildLogMsg (msg: Message, startTime: number) {
    const endTime = Date.now()
    return `${msg.channel.id} [${msg.channel.type === 0 ? 'TEXT' : 'DM'}] | ${msg.author.username}#${msg.author.discriminator} (${msg.author.id}) {${endTime - startTime}ms}: ${msg.cleanContent}`
  }

  gatherMsgInfo (msg: Message) {
    const { id, author, channel, type } = msg
    const o = {
      id,
      type: channel.type,
      author: {
        id: author.id,
        name: `${author.username}#${author.discriminator}`
      },
      channel: {
        id: channel.id,
        name: channel.name || ''
      },
      guild: {}
    }

    try {
      if (type === 0) {
        const { id, name } = ((msg.channel: any): TextChannel).guild
        o.guild = {
          id,
          name
        }
      }
    } catch (e) {
      log.warn('type was 0 but no guild info')
    }

    return o
  }

  // this is a very silly O(n) matcher. i bet we can do better later.
  findCmdIn (text: string, set: Set<Command>): ?{cmd: Command, matches: string[]} {
    for (const cmd of set) {
      const matches = text.match(cmd.regex)
      if (matches != null) {
        return { cmd, matches }
      }
    }
  }

  async tryCommand (msg: Message, text: string, startTime: number, ...sets: Array<Set<Command> | null>): Promise<boolean> {
    for (const set of sets) {
      if (set == null) {
        continue
      }

      for (const cmd of set) {
        const matches = text.match(cmd.regex)
        if (matches != null) {
          // handle!
          try {
            const result = await cmd.handler(this, msg, matches.slice(1))
            if (result != null) {
              await msg.channel.createMessage(result)
            }
          } catch (e) {
            log.error('command failed.', msg, e)
            this.sendErrorLog(msg, e)
            msg.channel.createMessage(`:x: Something went terribly wrong!`)
          }

          log.bot(this.buildLogMsg(msg, startTime))
          return true
        }
      }
    }

    return false
  }

  async handleChannelMessage (msg: Message) {
    const startTime = Date.now()

    // only react if there's a mention of myself.
    const check = msg.mentions.find(v => v.id === this.client.user.id)
    if (check == null) {
      return
    }

    // if root, we'll mixin some new commands
    const isRoot = this.isRoot(msg.author.id)

    const text = msg.content

    // check what consititutes a command prefix, <@botid> AND <@!botid> both are valid mentions.
    // this is reflected in the regex.
    if (this.commandCheck.test(text)) {
      const cmd = text.replace(this.commandCheck, '').trim()
      if (cmd !== '') { // empty? probably not good.
        const success = await this.tryCommand(msg, cmd, startTime, TextCommands, isRoot ? RootCommands : null)

        if (success === true) {
          log.debug('reached success', msg.content)
        } else {
          log.debug('no success.')
        }
      }
    }

    const channel: TextChannel = (msg.channel: any)
    channel.createMessage(`${randomEmoji()} Assign your roles here! ${this.config.appUrl}/s/${channel.guild.id}`)
  }

  async handleDMMessage (msg: Message) {
    const startTime = Date.now()
    const isRoot = this.isRoot(msg.author.id)
    await this.tryCommand(msg, msg.content, startTime, DMCommands, isRoot ? RootCommands : null)
  }

  handleMessage = (msg: Message) => {
    if (msg.author.bot) { // no bots
      return
    }

    switch (msg.channel.type) {
      case 0: // text channel
        return this.handleChannelMessage(msg)
      case 1: // dm channel
        return this.handleDMMessage(msg)
    }
  }

  async start () {
    this.client.on('messageCreate', this.handleMessage)
    await this.client.connect()
    log.info('started bot')
  }
}
