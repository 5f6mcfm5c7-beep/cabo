import { io } from 'socket.io-client'

const serverUrl =
  'https://merchants-batch-end-bbs.trycloudflare.com'

export const socket = io(serverUrl)