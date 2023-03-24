import axios from "axios"
import sleep from "sleep-promise"
import cliProgress from "cli-progress"
import { AxiosError } from "axios"
import "dotenv/config"

const guilds = []
const channels = []
const author = ""

const discordApi = axios.create({
  baseURL: "https://discord.com/api/v9",
  headers: {
    Authorization: process.env.TOKEN,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
  },
})

async function delegate(type, url) {
  try {
    return await discordApi[type](url)
  } catch (err) {
    const status = err.response?.status
    if (status == 429) {
      await sleep(err.response.data.retry_after * 1000)
      return delegate(type, url)
    } else if (status == 401) {
      console.log("Invalid token")
      process.exit()
    }
    if (err instanceof AxiosError) {
      console.log({ code: err.code, status: err.response?.status })
    }
    await sleep(5000)
    return delegate(type, url)
  }
}

async function getChannelName(channel) {
  const { name, recipients } = (await delegate("get", `/channels/${channel}`)).data
  if (name) {
    return name
  } else if (recipients.length == 1) {
    return recipients[0].username
  } else {
    return recipients.reduce((prev, curr) => {
      return prev.username + ", " + curr.username
    })
  }
}

async function getGuildName(guild) {
  return (await delegate("get", `/guilds/${guild}`)).data.name
}

function deleteMessage(channelId, id) {
  return delegate("delete", `channels/${channelId}/messages/${id}`)
}

async function searchMessagesByAuthor(type, id, author, offset) {
  const response = await delegate(
    "get",
    `${type}/${id}/messages/search?author_id=${author}&include_nsfw=true&sort_by=timestamp&sort_order=asc&offset=${offset}`
  )
  if (response?.status != 200) {
    return searchMessagesByAuthor(type, id, author, offset)
  }
  return response.data
}

async function deleteMessages(type, name, id) {
  let offset = 0
  await searchMessagesByAuthor(type, id, author, offset)
  let response = await searchMessagesByAuthor(type, id, author, offset)
  const bar = new cliProgress.SingleBar({
    format: `${name} ({offset}) |{bar}| {value}/{total}`,
    barCompleteChar: "\u25A0",
    barIncompleteChar: " ",
    hideCursor: true,
    noTTYOutput: process.env.NOTTY,
    notTTYSchedule: 20 * 60 * 1000,
  })
  bar.start(response.total_results, 0, { offset })

  while (response.total_results) {
    const { messages } = response

    const chats = messages.filter((message) => {
      return message[0].type == 0 || message[0].type == 6
    })

    for (const message of messages) {
      if (message[0].type != 0 && message[0].type != 6) {
        offset++
      } else {
        break
      }
    }
    bar.update({ offset })

    if (chats.length == 0 && offset + messages.length >= response.total_results) {
      break
    }

    if (messages.length == 0) {
      offset += 25 - (offset % 25)
      bar.update({ offset })
    }

    for (const chat of chats) {
      const [{ id, channel_id }] = chat
      await deleteMessage(channel_id, id)
      bar.increment()
    }

    response = await searchMessagesByAuthor(type, id, author, offset)
  }
  bar.stop()
}

async function main() {
  for (const guild of guilds) {
    await deleteMessages("/guilds", await getGuildName(guild), guild)
  }
  for (const channel of channels) {
    await deleteMessages("/channels", await getChannelName(channel), channel)
  }
}

main()
