import { Module } from '../lib/plugins.js'
import instaSave from './bin/instagram.js'

Module({
  command: 'insta',
  package: 'downloader',
  description: 'Download Instagram photo/video'
})(async (message, match) => {

  if (!match) {
    return message.send(
      '╭───「 📸 Instagram 」───╮\n' +
      '│ ❌ Instagram URL required\n' +
      '╰───────────────╯'
    )
  }

  try {
    const d = await instaSave(match)
    if (!d) return message.send('❌ Download failed')

    const caption =
      '╭───「 📸 Instagram 」───╮\n' +
      (d.description ? `│ ${d.description}\n` : '│\n') +
      '╰───────────────╯\n\n' +
      '✦ 𝐏ᴏᴡᴇʀᴇᴅ 𝐁Y  𝐑ᴀʙʙɪᴛ Xᴍᴅ Mɪɴɪ'

    if (d.MP4) {
      return message.send({ video: { url: d.MP4 }, caption })
    }

    if (d.JPEG) {
      return message.send({ image: { url: d.JPEG }, caption })
    }

    return message.send('❌ Unsupported post type')

  } catch (e) {
    console.error(e)
    return message.send('⚠️ Error occurred')
  }
})
